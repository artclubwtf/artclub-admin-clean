import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { downloadFromS3 } from "@/lib/s3";
import { upsertArtistMetaobject } from "@/lib/shopify";
import { createDraftArtworkProduct } from "@/lib/shopifyArtworks";
import { ApplicationArtworkModel } from "@/models/ApplicationArtwork";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { ArtistModel } from "@/models/Artist";
import { MediaModel } from "@/models/Media";

const allowedStatuses = ["in_review", "accepted", "rejected"] as const;

type StatusPayload = {
  status?: (typeof allowedStatuses)[number];
  note?: string;
};

function isValidTransition(current: string, next: StatusPayload["status"]) {
  if (!next) return false;
  if (current === next) return true;
  if (current === "submitted" && next === "in_review") return true;
  if (current === "in_review" && (next === "accepted" || next === "rejected")) return true;
  return false;
}

function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("@")) return `https://instagram.com/${trimmed.slice(1)}`;
  return `https://${trimmed}`;
}

function pickDisplayName(application: { personal?: { fullName?: string | null; email?: string | null } | null }) {
  const name = application.personal?.fullName?.trim();
  if (name) return name;
  const email = application.personal?.email?.trim();
  if (email) return email;
  return "New Artist";
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as StatusPayload | null;
  const status = body?.status;
  const note = body?.note?.trim() || "";

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (!isValidTransition(application.status, status)) {
    return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
  }

  const now = new Date();

  if (status === "accepted") {
    const displayName = pickDisplayName(application);
    let artist = null;

    if (application.linkedArtistId && Types.ObjectId.isValid(application.linkedArtistId.toString())) {
      artist = await ArtistModel.findById(application.linkedArtistId);
    }

    if (!artist) {
      const instagramUrl = normalizeUrl(application.shopify?.instagramUrl || undefined);
      artist = await ArtistModel.create({
        name: displayName,
        email: application.personal?.email || undefined,
        phone: application.personal?.phone || undefined,
        stage: "Offer",
        publicProfile: {
          name: displayName,
          displayName,
          instagram: instagramUrl || undefined,
          quote: application.shopify?.quote || undefined,
          einleitung_1: application.shopify?.einleitung_1 || undefined,
          text_1: application.shopify?.text_1 || undefined,
          kategorie: application.shopify?.kategorieCollectionGid || undefined,
          bilder: application.profileImages?.titelbildGid || undefined,
          bild_1: application.profileImages?.bild1Gid || undefined,
          bild_2: application.profileImages?.bild2Gid || undefined,
          bild_3: application.profileImages?.bild3Gid || undefined,
        },
      });
      application.linkedArtistId = artist._id;
    }

    const metaobjectFields = {
      name: displayName,
      instagram: normalizeUrl(application.shopify?.instagramUrl || undefined),
      quote: application.shopify?.quote || null,
      einleitung_1: application.shopify?.einleitung_1 || null,
      text_1: application.shopify?.text_1 || null,
      kategorie: application.shopify?.kategorieCollectionGid || null,
      bilder: application.profileImages?.titelbildGid || null,
      bild_1: application.profileImages?.bild1Gid || null,
      bild_2: application.profileImages?.bild2Gid || null,
      bild_3: application.profileImages?.bild3Gid || null,
    };

    const metaobjectResult = await upsertArtistMetaobject({
      metaobjectId: application.shopifyMetaobjectId || artist.shopifySync?.metaobjectId || undefined,
      handle: artist.shopifySync?.handle || undefined,
      fields: metaobjectFields,
    });

    application.shopifyMetaobjectId = metaobjectResult.id;
    artist.shopifySync = {
      ...artist.shopifySync,
      metaobjectId: metaobjectResult.id,
      handle: metaobjectResult.handle,
      lastSyncedAt: now,
      lastSyncStatus: "ok",
      lastSyncError: undefined,
    };
    await artist.save();
    await application.save();

    const createdProductIds = new Set(application.createdProductIds || []);
    const artworks = await ApplicationArtworkModel.find({ applicationId: application._id });

    for (const artwork of artworks) {
      if (artwork.shopifyProductId) {
        createdProductIds.add(artwork.shopifyProductId);
        continue;
      }

      const mediaDocs = await MediaModel.find({
        _id: { $in: artwork.mediaIds },
        kind: "artwork",
        $or: [
          { ownerType: "application", ownerId: application._id },
          { ownerType: "artist", artistId: artist._id },
        ],
      }).lean();

      if (mediaDocs.length !== artwork.mediaIds.length) {
        throw new Error(`Missing media for artwork ${artwork._id.toString()}`);
      }

      const images = [] as Array<{ buffer: Buffer; mimeType?: string; filename?: string }>;
      for (const doc of mediaDocs) {
        const downloaded = await downloadFromS3(doc.s3Key);
        if (!downloaded.body || downloaded.body.length === 0) {
          throw new Error(`Failed to download media ${doc._id.toString()}`);
        }
        images.push({
          buffer: downloaded.body,
          mimeType: doc.mimeType || downloaded.contentType || "application/octet-stream",
          filename: doc.filename || doc.s3Key,
        });
      }

      const created = await createDraftArtworkProduct({
        artistShopifyMetaobjectGid: metaobjectResult.id,
        title: artwork.title,
        shortDescription: artwork.shortDescription || undefined,
        widthCm: artwork.widthCm ?? undefined,
        heightCm: artwork.heightCm ?? undefined,
        offering: artwork.offering,
        originalPriceEur: artwork.offering === "original_plus_prints" ? artwork.originalPriceEur ?? undefined : undefined,
        images,
      });

      artwork.shopifyProductId = created.productId;
      artwork.shopifyAdminUrl = created.adminUrl || undefined;
      artwork.status = "submitted";
      await artwork.save();
      createdProductIds.add(created.productId);
    }

    const appMedia = await MediaModel.find({ ownerType: "application", ownerId: application._id }).lean();
    if (appMedia.length) {
      const existing = await MediaModel.find({
        ownerType: "artist",
        artistId: artist._id,
        s3Key: { $in: appMedia.map((m) => m.s3Key) },
      })
        .select({ s3Key: 1 })
        .lean();
      const existingKeys = new Set(existing.map((m) => m.s3Key));
      const inserts = appMedia
        .filter((m) => !existingKeys.has(m.s3Key))
        .map((m) => ({
          ownerType: "artist",
          ownerId: artist._id,
          artistId: artist._id,
          kind: m.kind,
          filename: m.filename ?? undefined,
          mimeType: m.mimeType ?? undefined,
          sizeBytes: m.sizeBytes ?? undefined,
          s3Key: m.s3Key,
          url: m.url ?? undefined,
        }));
      if (inserts.length) {
        await MediaModel.insertMany(inserts);
      }
    }

    application.createdProductIds = Array.from(createdProductIds);
  }

  application.status = status;

  if (status === "in_review") {
    application.reviewedAt = application.reviewedAt || now;
    if (note) {
      application.admin = { ...application.admin, reviewerNote: note };
    }
  }

  if (status === "accepted") {
    application.acceptedAt = application.acceptedAt || now;
    application.reviewedAt = application.reviewedAt || now;
    if (note) {
      application.admin = { ...application.admin, decisionNote: note };
    }
  }

  if (status === "rejected") {
    application.reviewedAt = application.reviewedAt || now;
    if (note) {
      application.admin = { ...application.admin, decisionNote: note };
    }
  }

  await application.save();

  return NextResponse.json(
    {
      application: {
        id: application._id.toString(),
        status: application.status,
        reviewedAt: application.reviewedAt,
        acceptedAt: application.acceptedAt,
        linkedArtistId: application.linkedArtistId?.toString(),
        shopifyMetaobjectId: application.shopifyMetaobjectId || undefined,
        createdProductIds: application.createdProductIds || [],
        admin: application.admin || {},
      },
    },
    { status: 200 },
  );
}
