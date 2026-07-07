import { randomUUID } from "node:crypto";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError } from "@/lib/server/network-service";
import { ImageUploadError, imageUploadMaxBytes, parseImageUploadVariant, processImageUpload } from "@/lib/server/image-upload";
import { getPublicS3Url, getS3ObjectUrl, uploadToS3 } from "@/lib/server/s3";

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const VIDEO_MAX = 100 * 1024 * 1024;
const recentUploads = new Map<string, number[]>();

function withinRateLimit(userId: string) {
  const cutoff = Date.now() - 60_000;
  const recent = (recentUploads.get(userId) || []).filter((value) => value >= cutoff);
  if (recent.length >= 30) return false;
  recent.push(Date.now());
  recentUploads.set(userId, recent);
  return true;
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext({ allowMissingProfile: true });
  if (!auth.ok) return auth.response;
  const ownerId = String(auth.context.profile?._id || auth.context.user._id);
  if (!withinRateLimit(String(auth.context.user._id))) return apiError("rate_limited", 429);
  const data = await req.formData().catch(() => null);
  const file = data?.get("file");
  if (!(file instanceof File) || !file.size) return apiError("file_required");
  const variant = parseImageUploadVariant(data?.get("variant") || null);
  const isVideo = VIDEO_TYPES.has(file.type);
  if (file.type.startsWith("video/") && !isVideo) return apiError("invalid_file_type");
  if (!isVideo && !IMAGE_TYPES.has(file.type.toLowerCase())) return apiError("invalid_file_type");
  if (isVideo && file.size > VIDEO_MAX) return apiError("file_too_large");
  if (!isVideo && file.size > imageUploadMaxBytes(variant)) return apiError("file_too_large");

  try {
    const raw = Buffer.from(await file.arrayBuffer());
    const processed = isVideo ? null : await processImageUpload(raw, variant);
    const extension = processed?.extension || file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const key = `network/${ownerId}/${variant}/${randomUUID()}.${extension}`;
    const body = processed?.buffer || raw;
    const mimeType = processed?.mimeType || file.type;
    const uploaded = await uploadToS3(key, body, mimeType, `upload.${extension}`, body.length);
    const publicUrl = getPublicS3Url(uploaded.key);
    const url = uploaded.url || publicUrl || await getS3ObjectUrl(uploaded.key, 15 * 60).catch(() => "");
    if (!url) return apiError("upload_missing_url", 500);
    return Response.json({
      ok: true,
      media: {
        storageKey: uploaded.key,
        url,
        type: isVideo ? "video" : "image",
        mimeType,
        sizeBytes: body.length,
        width: processed?.width,
        height: processed?.height,
        blurDataUrl: processed?.blurDataUrl,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageUploadError) return apiError(error.code, 400);
    console.error("Network upload failed", error);
    return apiError("upload_unavailable", 503);
  }
}
