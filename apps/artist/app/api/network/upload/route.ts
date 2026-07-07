import { randomUUID } from "node:crypto";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError } from "@/lib/server/network-service";
import { ImageUploadError, imageUploadMaxBytes, parseImageUploadVariant, processImageUpload } from "@/lib/server/image-upload";
import { buildNetworkMediaUrl } from "@/lib/server/network-media";
import { isSafeNetworkStorageKey } from "@/lib/server/network-media";
import { uploadToS3 } from "@/lib/server/s3";

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
    if (isVideo) {
      const mp4 = raw.length > 12 && raw.subarray(4, 8).toString("ascii") === "ftyp";
      const webm = raw.length > 4 && raw.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
      if (!mp4 && !webm) return apiError("invalid_video_data");
    }
    const processed = isVideo ? null : await processImageUpload(raw, variant);
    const extension = processed?.extension || file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const assetId = randomUUID();
    const key = `network/${ownerId}/${variant}/${assetId}.${extension}`;
    const body = processed?.buffer || raw;
    const mimeType = processed?.mimeType || file.type;
    const uploaded = await uploadToS3(key, body, mimeType, `upload.${extension}`, body.length);
    const url = buildNetworkMediaUrl(req.url, uploaded.key);
    let original: { key: string; url: string } | undefined;
    if (!isVideo && variant === "event-cover") {
      const inputExtension = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : file.type.includes("hei") ? "heic" : "jpg";
      const originalKey = `network/${ownerId}/event-cover-original/${assetId}.${inputExtension}`;
      const stored = await uploadToS3(originalKey, raw, file.type, file.name, raw.length);
      original = { key: stored.key, url: buildNetworkMediaUrl(req.url, stored.key) };
    }
    const suppliedWidth=Number(data?.get("width")||0);const suppliedHeight=Number(data?.get("height")||0);const suppliedDuration=Number(data?.get("duration")||0);const posterStorageKey=String(data?.get("posterStorageKey")||"");const posterUrl=String(data?.get("posterUrl")||"");
    return Response.json({
      ok: true,
      media: {
        storageKey: uploaded.key,
        provider: "s3",
        url,
        type: isVideo ? "video" : "image",
        mimeType,
        sizeBytes: body.length,
        width: processed?.width,
        height: processed?.height,
        blurDataUrl: processed?.blurDataUrl,
        ...(original ? { originalStorageKey: original.key, originalUrl: original.url } : {}),
        ...(isVideo&&suppliedWidth>0&&suppliedWidth<=12000?{width:Math.round(suppliedWidth)}:{}),
        ...(isVideo&&suppliedHeight>0&&suppliedHeight<=12000?{height:Math.round(suppliedHeight)}:{}),
        ...(isVideo&&suppliedDuration>0&&suppliedDuration<=24*60*60?{duration:suppliedDuration}:{}),
        ...(isVideo&&isSafeNetworkStorageKey(posterStorageKey)?{posterStorageKey,posterUrl}:{}),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageUploadError) return apiError(error.code, 400);
    console.error("Network upload failed", error);
    return apiError("upload_unavailable", 503);
  }
}
