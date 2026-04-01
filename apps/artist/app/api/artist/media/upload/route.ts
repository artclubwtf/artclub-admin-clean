import { NextResponse } from "next/server";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import { getPublicS3Url, getS3ObjectUrl, uploadToS3 } from "@/lib/server/s3";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function sanitizeFilename(name: string) {
  const trimmed = name.trim() || "upload";
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return base || "upload";
}

export async function POST(req: Request) {
  await connectMongo();
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
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }
  if (!file.type?.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "invalid_file_type" }, { status: 400 });
  }

  try {
    const safeName = sanitizeFilename(file.name || "upload");
    const key = `artist/${encodeURIComponent(context.user.shopDomain)}/${encodeURIComponent(context.user.artistKey)}/${Date.now()}-${safeName}`;
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
    console.error("Failed to upload artist media file", err);
    return NextResponse.json({ ok: false, error: err?.message || "upload_failed" }, { status: 500 });
  }
}
