import { Types } from "mongoose";

export function buildArtistMediaAssetUrl(id: string | Types.ObjectId) {
  return `/api/artist/media/${id.toString()}/file`;
}

export function buildPublicArtistMediaAssetUrl(id: string | Types.ObjectId) {
  return `/api/public/artist-media/${id.toString()}/file`;
}

export function parseArtistMediaIdFromUrl(value: string | undefined | null) {
  if (!value) return null;
  const match = value.match(/\/api\/(?:artist\/media|public\/artist-media)\/([a-fA-F0-9]{24})(?:\/file)?(?:[/?#]|$)/);
  return match?.[1] || null;
}

export function normalizePublicArtistMediaUrl(value: string | undefined | null) {
  if (!value) return "";
  const id = parseArtistMediaIdFromUrl(value);
  if (!id) return value;
  return buildPublicArtistMediaAssetUrl(id);
}

export function normalizePublicArtistMediaUrls(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => normalizePublicArtistMediaUrl(value)).filter(Boolean)));
}

export function resolveArtistMediaUrls(media: {
  _id: string | Types.ObjectId;
  url?: string | null;
  previewUrl?: string | null;
  s3Key?: string | null;
}) {
  const stableUrl = buildArtistMediaAssetUrl(media._id);
  return {
    url: stableUrl,
    previewUrl: stableUrl,
  };
}

export function resolvePublicArtistMediaUrls(media: {
  _id: string | Types.ObjectId;
  url?: string | null;
  previewUrl?: string | null;
  s3Key?: string | null;
}) {
  const stableUrl = buildPublicArtistMediaAssetUrl(media._id);
  return {
    url: stableUrl,
    previewUrl: stableUrl,
  };
}
