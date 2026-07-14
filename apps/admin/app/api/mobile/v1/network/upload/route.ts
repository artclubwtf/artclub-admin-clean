import { randomUUID } from "node:crypto";

import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { uploadToS3 } from "@/lib/s3";

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/webm", "video/quicktime"]);
export async function POST(req: Request) {
  const auth = await mobileNetworkContext(req, true); if (!auth.ok) return auth.response;
  const data = await req.formData().catch(() => null); const file = data?.get("file"); if (!(file instanceof File) || !file.size) return mobileError("file_required");
  if (!allowed.has(file.type.toLowerCase())) return mobileError("invalid_file_type"); const isVideo = file.type.startsWith("video/"); const max = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024; if (file.size > max) return mobileError("file_too_large", 413);
  const requestOrigin = new URL(req.url).origin; const configuredOrigin = process.env.MOBILE_API_PUBLIC_BASE_URL?.replace(/\/$/, ""); const origin = configuredOrigin || requestOrigin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin)) return mobileError("mobile_media_public_origin_required", 503);
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (isVideo ? "mp4" : "jpg"); const owner = String(auth.profile?._id || auth.user._id); const key = `network/${owner}/mobile/${randomUUID()}.${extension}`; const buffer = Buffer.from(await file.arrayBuffer());
  try { const stored = await uploadToS3(key, buffer, file.type, file.name, buffer.length); const url = `${origin}/api/mobile/v1/network/media/${key}`; return Response.json({ ok: true, media: { storageKey: stored.key, provider: "s3", url, type: isVideo ? "video" : "image", mimeType: file.type, sizeBytes: buffer.length } }, { status: 201 }); }
  catch { return mobileError("upload_unavailable", 503); }
}
