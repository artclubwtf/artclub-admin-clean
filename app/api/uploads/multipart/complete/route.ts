import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { completeMultipartUpload, getS3ObjectUrl } from "@/lib/s3";
import { MediaModel, mediaKinds } from "@/models/Media";

const schema = z.object({
  artistId: z.string().trim().min(1, "artistId required"),
  kind: z.enum(mediaKinds),
  filename: z.string().trim().min(1, "filename required"),
  contentType: z.string().trim().min(1, "contentType required"),
  size: z.number().int().positive("size must be > 0"),
  key: z.string().trim().min(1, "key required"),
  uploadId: z.string().trim().min(1, "uploadId required"),
  parts: z
    .array(
      z.object({
        ETag: z.string().trim().min(1),
        PartNumber: z.number().int().positive().max(10000),
      }),
    )
    .nonempty("At least one part required"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { artistId, kind, filename, contentType, size, key, uploadId, parts } = parsed.data;
    if (!Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    if (!key.startsWith(`artist/${encodeURIComponent(artistId)}/`)) {
      return NextResponse.json({ error: "Key does not match artistId" }, { status: 400 });
    }

    await connectMongo();

    await completeMultipartUpload(
      key,
      uploadId,
      parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber })),
    );

    const base = process.env.S3_PUBLIC_BASE_URL ? process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "") : undefined;
    const url = base ? `${base}/${key}` : undefined;
    const previewUrl = url || (await getS3ObjectUrl(key, 15 * 60).catch(() => undefined));

    const created = await MediaModel.create({
      artistId: new Types.ObjectId(artistId),
      kind,
      filename,
      mimeType: contentType,
      sizeBytes: size,
      s3Key: key,
      url,
    });

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
          url: created.url ?? previewUrl,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Complete multipart upload failed", err);
    return NextResponse.json({ error: "Failed to complete multipart upload" }, { status: 500 });
  }
}
