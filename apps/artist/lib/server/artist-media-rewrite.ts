import { Types } from "mongoose";

import { ArtistMediaV2Model } from "@/lib/server/models";
import { buildPublicArtistMediaAssetUrl, normalizePublicArtistMediaUrl, parseArtistMediaIdFromUrl } from "@/lib/server/artist-media";

export async function createArtistMediaUrlRewriter(input: {
  shopDomain: string;
  artistKey: string;
  candidateUrls: Array<string | undefined | null>;
}) {
  const urls = Array.from(new Set(input.candidateUrls.map((value) => value?.trim()).filter(Boolean))) as string[];
  const ids = Array.from(
    new Set(urls.map((value) => parseArtistMediaIdFromUrl(value)).filter(Boolean)),
  ) as string[];

  if (!urls.length && !ids.length) {
    return (value: string | undefined | null) => normalizePublicArtistMediaUrl(value);
  }

  const orFilters: Record<string, unknown>[] = [];
  if (ids.length) {
    orFilters.push({ _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } });
  }
  if (urls.length) {
    orFilters.push({ url: { $in: urls } });
    orFilters.push({ previewUrl: { $in: urls } });
  }

  const docs = orFilters.length
    ? await ArtistMediaV2Model.find({
        shopDomain: input.shopDomain,
        artistKey: input.artistKey,
        $or: orFilters,
      })
        .select({ _id: 1, url: 1, previewUrl: 1 })
        .lean()
    : [];

  const map = new Map<string, string>();
  for (const doc of docs) {
    const publicUrl = buildPublicArtistMediaAssetUrl(doc._id);
    map.set(doc._id.toString(), publicUrl);
    if (doc.url) map.set(doc.url, publicUrl);
    if (doc.previewUrl) map.set(doc.previewUrl, publicUrl);
  }

  return (value: string | undefined | null) => {
    if (!value) return "";
    const normalized = value.trim();
    const direct = map.get(normalized);
    if (direct) return direct;
    const id = parseArtistMediaIdFromUrl(normalized);
    if (id) return map.get(id) || buildPublicArtistMediaAssetUrl(id);
    return normalizePublicArtistMediaUrl(normalized);
  };
}
