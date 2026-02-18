import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { PayoutDetailsModel } from "@/models/PayoutDetails";
import { RequestModel, requestStatuses } from "@/models/Request";
import { ArtistModel } from "@/models/Artist";
import { MediaModel } from "@/models/Media";
import { downloadFromS3 } from "@/lib/s3";
import { createDraftArtworkProduct } from "@/lib/shopifyArtworks";

type ActionPayload = {
  action?: "approve" | "reject";
  note?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as ActionPayload | null;
  const action = body?.action;
  const note = body?.note?.toString();

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await connectMongo();
  const request = await RequestModel.findById(id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  let nextStatus: (typeof requestStatuses)[number] = action === "approve" ? "approved" : "rejected";

  if (action === "approve" && request.type === "payout_update") {
    const payoutPayload = (request.payload as { payout?: Record<string, unknown> } | null)?.payout || {};
    await PayoutDetailsModel.findOneAndUpdate(
      { kunstlerId: request.artistId?.toString() },
      {
        $set: {
          kunstlerId: request.artistId?.toString(),
          accountHolder: payoutPayload.accountHolder ?? null,
          iban: payoutPayload.iban ?? null,
          bic: payoutPayload.bic ?? null,
          bankName: payoutPayload.bankName ?? null,
          address: payoutPayload.address ?? null,
          taxId: payoutPayload.taxId ?? null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    nextStatus = "applied";
    request.appliedAt = new Date();
  } else if (action === "approve" && request.type === "artwork_create") {
    if (!request.artistId) {
      return NextResponse.json({ error: "Request missing artist" }, { status: 400 });
    }

    const payload = request.payload as
      | {
          title?: string;
          shortDescription?: string;
          widthCm?: number;
          heightCm?: number;
          offering?: "print_only" | "original_plus_prints";
          originalPriceEur?: number;
          mediaIds?: string[];
        }
      | undefined;

    const mediaIds = Array.isArray(payload?.mediaIds) ? payload?.mediaIds : [];
    if (!mediaIds.length) {
      return NextResponse.json({ error: "Artwork request missing media" }, { status: 400 });
    }

    const artist = await ArtistModel.findById(request.artistId).lean();
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }
    if (!artist.shopifySync?.metaobjectId) {
      return NextResponse.json({ error: "Artist not linked to Shopify" }, { status: 400 });
    }

    const objectIds = mediaIds
      .filter((mid): mid is string => typeof mid === "string" && Types.ObjectId.isValid(mid))
      .map((mid) => new Types.ObjectId(mid));
    if (objectIds.length !== mediaIds.length) {
      return NextResponse.json({ error: "Invalid media ids" }, { status: 400 });
    }

    const mediaDocs = await MediaModel.find({
      _id: { $in: objectIds },
      artistId: request.artistId,
      kind: "artwork",
    }).lean();
    if (mediaDocs.length !== mediaIds.length) {
      return NextResponse.json({ error: "Media not found for artist" }, { status: 400 });
    }

    const images = [];
    for (const doc of mediaDocs) {
      const downloaded = await downloadFromS3(doc.s3Key);
      if (!downloaded.body || downloaded.body.length === 0) {
        return NextResponse.json({ error: `Failed to download media ${doc._id.toString()}` }, { status: 500 });
      }
      images.push({
        buffer: downloaded.body,
        mimeType: doc.mimeType || downloaded.contentType || "application/octet-stream",
        filename: doc.filename || doc.s3Key,
      });
    }

    const offering = payload?.offering === "original_plus_prints" ? "original_plus_prints" : "print_only";
    if (offering === "original_plus_prints" && (payload?.originalPriceEur === undefined || payload?.originalPriceEur === null)) {
      return NextResponse.json({ error: "Original price required for this offering" }, { status: 400 });
    }
    const created = await createDraftArtworkProduct({
      artistShopifyMetaobjectGid: artist.shopifySync.metaobjectId,
      title: payload?.title || "Untitled artwork",
      shortDescription: payload?.shortDescription,
      widthCm: payload?.widthCm,
      heightCm: payload?.heightCm,
      offering,
      originalPriceEur: offering === "original_plus_prints" ? payload?.originalPriceEur : undefined,
      images,
    });

    nextStatus = "applied";
    request.appliedAt = new Date();
    request.result = {
      shopifyProductId: created.productId,
      shopifyAdminUrl: created.adminUrl || undefined,
    };
  } else if (action === "approve" && request.type === "profile_update") {
    if (!request.artistId) {
      return NextResponse.json({ error: "Request missing artist" }, { status: 400 });
    }

    const payload = request.payload as
      | {
          publicProfile?: {
            name?: string | null;
            displayName?: string | null;
            quote?: string | null;
            einleitung_1?: string | null;
            text_1?: string | null;
            instagram?: string | null;
            website?: string | null;
            location?: string | null;
          };
        }
      | undefined;

    const publicProfile = payload?.publicProfile || {};
    const update: Record<string, unknown> = {};

    if ("name" in publicProfile) {
      update["publicProfile.name"] = publicProfile.name ?? null;
      update["publicProfile.displayName"] = publicProfile.displayName ?? publicProfile.name ?? null;
    }
    if ("displayName" in publicProfile && !("name" in publicProfile)) {
      update["publicProfile.displayName"] = publicProfile.displayName ?? null;
    }
    if ("quote" in publicProfile) update["publicProfile.quote"] = publicProfile.quote ?? null;
    if ("einleitung_1" in publicProfile) update["publicProfile.einleitung_1"] = publicProfile.einleitung_1 ?? null;
    if ("text_1" in publicProfile) {
      update["publicProfile.text_1"] = publicProfile.text_1 ?? null;
      update["publicProfile.bio"] = publicProfile.text_1 ?? null;
    }
    if ("instagram" in publicProfile) update["publicProfile.instagram"] = publicProfile.instagram ?? null;
    if ("website" in publicProfile) update["publicProfile.website"] = publicProfile.website ?? null;
    if ("location" in publicProfile) update["publicProfile.location"] = publicProfile.location ?? null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Profile update has no changes" }, { status: 400 });
    }

    await ArtistModel.findByIdAndUpdate(request.artistId, { $set: update }, { new: false });
    nextStatus = "applied";
    request.appliedAt = new Date();
  }

  request.status = nextStatus;
  request.reviewerUserId = new Types.ObjectId(session.user.id);
  request.reviewerNote = note;
  await request.save();

  return NextResponse.json(
    {
      request: {
        id: request._id.toString(),
        status: request.status,
        appliedAt: request.appliedAt,
        reviewerNote: request.reviewerNote,
        result: request.result,
      },
    },
    { status: 200 },
  );
}
