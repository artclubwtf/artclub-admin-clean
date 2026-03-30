import { NextResponse } from "next/server";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { getPublicS3Url, getS3ObjectUrl, uploadToS3 } from "@/lib/s3";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function sanitizeFilename(name: string) {
  const trimmed = name.trim() || "upload";
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return base || "upload";
}

export async function POST(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ ok: false, error: "file_empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }
  if (!file.type?.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "invalid_file_type" }, { status: 400 });
  }

  try {
    const safeName = sanitizeFilename(file.name || "upload");
    const key = `artists-v2/${encodeURIComponent(context.user.shopDomain)}/${encodeURIComponent(context.user.artistKey)}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToS3(key, buffer, file.type || "application/octet-stream", safeName, file.size);
    const publicUrl = getPublicS3Url(uploaded.key);
    const fallbackSignedUrl = publicUrl ? undefined : await getS3ObjectUrl(uploaded.key, 15 * 60).catch(() => undefined);
    const resolvedUrl = uploaded.url || publicUrl || fallbackSignedUrl || "";

    if (!resolvedUrl) {
      return NextResponse.json({ ok: false, error: "upload_missing_url" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        file: {
          s3Key: uploaded.key,
          filename: uploaded.filename || safeName,
          mimeType: uploaded.mimeType || file.type,
          sizeBytes: uploaded.sizeBytes ?? file.size,
          url: resolvedUrl,
          previewUrl: publicUrl || resolvedUrl,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Failed to upload artist v2 media file", err);
    return NextResponse.json({ ok: false, error: err?.message || "upload_failed" }, { status: 500 });
  }
}
