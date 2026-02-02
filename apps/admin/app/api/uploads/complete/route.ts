import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { getPublicS3Url, getS3ObjectUrl } from "@/lib/s3";
import { MediaModel, mediaKinds } from "@/models/Media";

const completeSchema = z.object({
  artistId: z.string().trim().min(1, "artistId required"),
  kind: z.enum(mediaKinds),
  filename: z.string().trim().min(1, "filename required"),
  contentType: z.string().trim().min(1, "contentType required"),
  size: z.number().int().positive("size must be > 0"),
  key: z.string().trim().min(1, "key required"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { artistId, kind, filename, contentType, size, key } = parsed.data;
    if (!Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }

    // Basic safeguard: ensure key belongs to the artist path
    if (!key.startsWith(`artist/${encodeURIComponent(artistId)}/`)) {
      return NextResponse.json({ error: "Key does not match artistId" }, { status: 400 });
    }

    await connectMongo();

    const previewUrl = getPublicS3Url(key);

    const created = await MediaModel.create({
      artistId: new Types.ObjectId(artistId),
      kind,
      filename,
      mimeType: contentType,
      sizeBytes: size,
      s3Key: key,
      url: previewUrl,
      previewUrl,
    });

    const signedUrl = await getS3ObjectUrl(key, 15 * 60).catch(() => undefined);
    const responseUrl = previewUrl || signedUrl;

    return NextResponse.json(
      {
        media: {
          id: created._id.toString(),
          artistId: created.artistId?.toString(),
          kind: created.kind,
          filename: created.filename,
          mimeType: created.mimeType,
          sizeBytes: created.sizeBytes,
          s3Key: created.s3Key,
          url: created.url ?? responseUrl,
          previewUrl: created.previewUrl ?? responseUrl,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Complete upload failed", err);
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 });
  }
}
