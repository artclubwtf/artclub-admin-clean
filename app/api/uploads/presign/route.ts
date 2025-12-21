import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { createPresignedPutUrl, getS3ObjectUrl } from "@/lib/s3";
import { mediaKinds } from "@/models/Media";

const presignSchema = z.object({
  artistId: z.string().trim().min(1, "artistId required"),
  kind: z.enum(mediaKinds),
  filename: z.string().trim().min(1, "filename required"),
  contentType: z.string().trim().min(1, "contentType required"),
  size: z.number().int().positive("size must be > 0"),
});

function slugFilename(name: string) {
  const trimmed = name.trim() || "upload";
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return base || "upload";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = presignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { artistId, filename, kind, contentType, size } = parsed.data;
    if (!Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }

    await connectMongo();

    const safeName = slugFilename(filename);
    const key = `artist/${encodeURIComponent(artistId)}/${Date.now()}-${safeName}`;
    const { uploadUrl, expiresIn } = await createPresignedPutUrl(key, contentType);

    let previewUrl: string | undefined;
    if (!process.env.S3_PUBLIC_BASE_URL) {
      previewUrl = await getS3ObjectUrl(key, 15 * 60).catch(() => undefined);
    } else {
      previewUrl = `${process.env.S3_PUBLIC_BASE_URL.replace(/\\/$/, "")}/${key}`;
    }

    return NextResponse.json(
      {
        key,
        uploadUrl,
        headers: { "Content-Type": contentType },
        expiresIn,
        previewUrl,
        size,
        kind,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Presign upload failed", err);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
