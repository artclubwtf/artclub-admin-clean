import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { MediaModel, mediaKinds } from "@/models/Media";
import { getS3ObjectUrl, uploadToS3 } from "@/lib/s3";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB per file

function sanitizeFilename(name: string) {
  const trimmed = name.trim() || "upload";
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "upload";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kunstlerId = searchParams.get("kunstlerId");
    if (!kunstlerId || !Types.ObjectId.isValid(kunstlerId)) {
      return NextResponse.json({ error: "Invalid kunstlerId" }, { status: 400 });
    }

    await connectMongo();
    const mediaDocs = await MediaModel.find({ artistId: new Types.ObjectId(kunstlerId) })
      .sort({ createdAt: -1 })
      .lean();

    const mediaWithUrls = await Promise.all(
      mediaDocs.map(async (doc) => {
        if (doc.url) return doc;
        try {
          const signedUrl = await getS3ObjectUrl(doc.s3Key);
          return { ...doc, url: signedUrl };
        } catch {
          return doc;
        }
      }),
    );

    return NextResponse.json({ media: mediaWithUrls }, { status: 200 });
  } catch (err) {
    console.error("Failed to list media", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const kunstlerId = form.get("kunstlerId");
    const kindRaw = form.get("kind");
    const files = form.getAll("files").filter((f) => f instanceof File) as File[];

    if (!kunstlerId || typeof kunstlerId !== "string" || !Types.ObjectId.isValid(kunstlerId)) {
      return NextResponse.json({ error: "Invalid kunstlerId" }, { status: 400 });
    }
    if (typeof kindRaw !== "string" || !mediaKinds.includes(kindRaw as any)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    await connectMongo();

    const uploads = [];
    for (const file of files) {
      if (file.size > MAX_SIZE_BYTES) {
        return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 });
      }
      const filename = sanitizeFilename(file.name || "upload");
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = file.type || "application/octet-stream";
      const timestamp = Date.now();
      const key = `media/${encodeURIComponent(kunstlerId)}/${timestamp}-${filename}`;
      const uploaded = await uploadToS3(key, buffer, contentType, filename);
      uploads.push({
        artistId: new Types.ObjectId(kunstlerId),
        kind: kindRaw,
        filename: uploaded.filename || filename,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        s3Key: uploaded.key,
        url: uploaded.url,
      });
    }

    const created = await MediaModel.insertMany(uploads);
    return NextResponse.json({ media: created.map((d) => d.toObject()) }, { status: 201 });
  } catch (err) {
    console.error("Failed to upload media", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
