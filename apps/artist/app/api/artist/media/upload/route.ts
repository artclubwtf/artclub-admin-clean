import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { ImageUploadError, imageUploadMaxBytes, parseImageUploadVariant, processImageUpload } from "@/lib/server/image-upload";
import { getPublicS3Url, getS3ObjectUrl, uploadToS3 } from "@/lib/server/s3";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function POST(req: Request) {
  const auth = await requireArtistApiContext({ allowIncompleteOnboarding: true });
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ ok: false, error: "file_empty" }, { status: 400 });
  }
  const variant = parseImageUploadVariant(formData?.get("variant") || null);
  if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "invalid_file_type" }, { status: 400 });
  }
  if (file.size > imageUploadMaxBytes(variant)) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processImageUpload(buffer, variant);
    const safeName = `upload.${processed.extension}`;
    const key = `artist/${encodeURIComponent(context.user.shopDomain)}/${encodeURIComponent(context.user.artistKey)}/${variant}/${randomUUID()}.${processed.extension}`;
    const uploaded = await uploadToS3(key, processed.buffer, processed.mimeType, safeName, processed.buffer.length);
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
          mimeType: uploaded.mimeType || processed.mimeType,
          sizeBytes: uploaded.sizeBytes ?? processed.buffer.length,
          url: resolvedUrl,
          previewUrl: publicUrl || resolvedUrl,
          width: processed.width,
          height: processed.height,
          blurDataUrl: processed.blurDataUrl,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err instanceof ImageUploadError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
    }
    console.error("Failed to upload artist media file", err);
    return NextResponse.json({ ok: false, error: err?.message || "upload_failed" }, { status: 500 });
  }
}
