import { Types } from "mongoose";

export function buildArtistMediaAssetUrl(id: string | Types.ObjectId) {
  return `/api/artist/media/${id.toString()}/file`;
}

export function parseArtistMediaIdFromUrl(value: string | undefined | null) {
  if (!value) return null;
  const match = value.match(/\/api\/artist\/media\/([a-fA-F0-9]{24})\/file(?:[/?#]|$)/);
  return match?.[1] || null;
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
