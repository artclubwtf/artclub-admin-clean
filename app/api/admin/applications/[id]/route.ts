import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { getS3ObjectUrl } from "@/lib/s3";
import { ApplicationArtworkModel } from "@/models/ApplicationArtwork";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { MediaModel } from "@/models/Media";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id).lean();
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const mediaDocs = await MediaModel.find({
    ownerType: "application",
    ownerId: new Types.ObjectId(id),
  })
    .sort({ createdAt: -1 })
    .lean();

  const media = await Promise.all(
    mediaDocs.map(async (m) => {
      const signedUrl = await getS3ObjectUrl(m.s3Key).catch(() => m.url);
      return {
        id: m._id.toString(),
        kind: m.kind,
        filename: m.filename ?? null,
        mimeType: m.mimeType ?? null,
        sizeBytes: m.sizeBytes ?? null,
        s3Key: m.s3Key,
        url: signedUrl || m.url || null,
        createdAt: m.createdAt,
      };
    }),
  );

  const artworks = await ApplicationArtworkModel.find({ applicationId: new Types.ObjectId(id) })
    .sort({ createdAt: -1 })
    .lean();

  const artworkPayload = artworks.map((artwork) => ({
    id: artwork._id.toString(),
    title: artwork.title,
    shortDescription: artwork.shortDescription ?? null,
    widthCm: artwork.widthCm ?? null,
    heightCm: artwork.heightCm ?? null,
    offering: artwork.offering,
    originalPriceEur: artwork.originalPriceEur ?? null,
    mediaIds: (artwork.mediaIds || []).map((mid) => mid.toString()),
    status: artwork.status ?? null,
    createdAt: artwork.createdAt,
    updatedAt: artwork.updatedAt,
  }));

  return NextResponse.json(
    {
      application: {
        id: application._id.toString(),
        status: application.status,
        personal: application.personal || {},
        shopify: application.shopify || {},
        profileImages: application.profileImages || {},
        legal: application.legal || {},
        admin: application.admin || {},
        submittedAt: application.submittedAt,
        reviewedAt: application.reviewedAt,
        acceptedAt: application.acceptedAt,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
      media,
      artworks: artworkPayload,
    },
    { status: 200 },
  );
}
