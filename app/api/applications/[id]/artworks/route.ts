import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { getApplicationTokenFromRequest, verifyApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { ApplicationArtworkModel } from "@/models/ApplicationArtwork";
import { MediaModel } from "@/models/Media";

const artworkPayloadSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    shortDescription: z.string().trim().optional(),
    widthCm: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().positive().optional(),
    ),
    heightCm: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().positive().optional(),
    ),
    offering: z.enum(["print_only", "original_plus_prints"]),
    originalPriceEur: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().positive().optional(),
    ),
    mediaIds: z.array(z.string().trim().min(1)).min(1, "At least one artwork image is required"),
  })
  .refine((val) => (val.offering === "original_plus_prints" ? !!val.originalPriceEur : true), {
    message: "Original price is required when selling originals",
    path: ["originalPriceEur"],
  });

async function loadApplication(req: Request, id: string) {
  const token = getApplicationTokenFromRequest(req);
  if (!token) {
    return { error: NextResponse.json({ error: "missing_token" }, { status: 401 }) } as const;
  }

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id);
  if (!application) {
    return { error: NextResponse.json({ error: "Application not found" }, { status: 404 }) } as const;
  }

  if (application.expiresAt && application.expiresAt.getTime() <= Date.now()) {
    return { error: NextResponse.json({ error: "token_expired" }, { status: 401 }) } as const;
  }

  if (!verifyApplicationToken(token, application.applicationTokenHash)) {
    return { error: NextResponse.json({ error: "invalid_token" }, { status: 401 }) } as const;
  }

  return { application } as const;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;
  if (result.application.status === "rejected") {
    return NextResponse.json({ error: "Registration is locked" }, { status: 403 });
  }

  const artworks = await ApplicationArtworkModel.find({ applicationId: new Types.ObjectId(id) })
    .sort({ createdAt: -1 })
    .lean();

  const payload = artworks.map((artwork) => ({
    id: artwork._id.toString(),
    title: artwork.title,
    shortDescription: artwork.shortDescription,
    widthCm: artwork.widthCm,
    heightCm: artwork.heightCm,
    offering: artwork.offering,
    originalPriceEur: artwork.originalPriceEur,
    mediaIds: (artwork.mediaIds || []).map((mid) => mid.toString()),
    status: artwork.status,
    createdAt: artwork.createdAt,
    updatedAt: artwork.updatedAt,
  }));

  return NextResponse.json({ artworks: payload }, { status: 200 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = artworkPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { mediaIds, ...rest } = parsed.data;
  const objectIds = mediaIds
    .filter((mid) => Types.ObjectId.isValid(mid))
    .map((mid) => new Types.ObjectId(mid));

  if (objectIds.length !== mediaIds.length) {
    return NextResponse.json({ error: "Invalid media selection" }, { status: 400 });
  }

  await connectMongo();
  const mediaDocs = await MediaModel.find({
    _id: { $in: objectIds },
    ownerType: "application",
    ownerId: new Types.ObjectId(id),
    kind: "artwork",
  })
    .select({ _id: 1 })
    .lean();

  if (mediaDocs.length !== mediaIds.length) {
    return NextResponse.json({ error: "Some media are not available" }, { status: 400 });
  }

  const created = await ApplicationArtworkModel.create({
    applicationId: new Types.ObjectId(id),
    title: rest.title,
    shortDescription: rest.shortDescription,
    widthCm: rest.widthCm,
    heightCm: rest.heightCm,
    offering: rest.offering,
    originalPriceEur: rest.offering === "original_plus_prints" ? rest.originalPriceEur : undefined,
    mediaIds: objectIds,
    status: "draft",
  });

  return NextResponse.json(
    {
      artwork: {
        id: created._id.toString(),
        title: created.title,
        shortDescription: created.shortDescription,
        widthCm: created.widthCm,
        heightCm: created.heightCm,
        offering: created.offering,
        originalPriceEur: created.originalPriceEur,
        mediaIds: (created.mediaIds || []).map((mid) => mid.toString()),
        status: created.status,
        createdAt: created.createdAt,
      },
    },
    { status: 201 },
  );
}
