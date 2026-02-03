import type { ArtworkCard, ReactionEmoji } from "@artclub/models";

type CacheImages = {
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  originalUrl?: string | null;
} | null;

type CacheLike = {
  productGid?: string | null;
  title?: string | null;
  handle?: string | null;
  artistMetaobjectGid?: string | null;
  artistName?: string | null;
  tags?: string[] | null;
  images?: CacheImages;
  widthCm?: number | null;
  heightCm?: number | null;
  priceEur?: number | null;
  isOriginalTagged?: boolean | null;
  shortDescription?: string | null;
  lastImportedAt?: Date | null;
  updatedAtShopify?: Date | null;
  createdAt?: Date | null;
};

type SignalsLike = {
  savesCount?: number | null;
  reactions?: Record<string, number> | null;
};

type MapOptions = {
  signals?: SignalsLike;
  saved?: boolean;
  reaction?: ReactionEmoji | null;
  createdAt?: Date | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveArtistId(metaobjectGid?: string | null, artistName?: string | null) {
  if (metaobjectGid) return metaobjectGid;
  const name = (artistName || "").trim();
  if (!name) return "unknown";
  const slug = slugify(name);
  return slug || "unknown";
}

function buildArtworkImages(cache: CacheLike): ArtworkCard["images"] {
  const images = cache.images;
  const urlThumb = images?.thumbUrl || images?.mediumUrl || images?.originalUrl || "";
  const urlMedium = images?.mediumUrl || images?.originalUrl || images?.thumbUrl || "";
  if (!urlThumb && !urlMedium) return [];

  const ratio =
    cache.widthCm && cache.heightCm && cache.heightCm > 0
      ? cache.widthCm / cache.heightCm
      : 1;
  const width = 960;
  const height = ratio > 0 ? Math.max(1, Math.round(width / ratio)) : 960;
  const aspectRatio = height > 0 ? width / height : 1;

  return [
    {
      urlThumb: urlThumb || urlMedium,
      urlMedium: urlMedium || urlThumb,
      width,
      height,
      aspectRatio,
    },
  ];
}

function sumReactions(reactions?: Record<string, number> | null) {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((total, value) => {
    const next = typeof value === "number" ? value : 0;
    return total + next;
  }, 0);
}

export function mapCacheToArtworkCard(cache: CacheLike, options: MapOptions = {}): ArtworkCard | null {
  const productGid = cache.productGid || "";
  if (!productGid) return null;

  const artistName = (cache.artistName || "").trim() || "Unknown Artist";
  const createdAt =
    options.createdAt ||
    cache.lastImportedAt ||
    cache.updatedAtShopify ||
    cache.createdAt ||
    new Date(0);

  return {
    id: productGid,
    productGid,
    title: cache.title || undefined,
    artistId: deriveArtistId(cache.artistMetaobjectGid, cache.artistName),
    artistName,
    tags: Array.isArray(cache.tags) ? cache.tags : [],
    images: buildArtworkImages(cache),
    counts: {
      reactions: sumReactions(options.signals?.reactions),
      saves: options.signals?.savesCount ?? 0,
    },
    myState: {
      saved: options.saved,
      reaction: options.reaction ?? undefined,
    },
    createdAt: createdAt.toISOString(),
    handle: cache.handle || undefined,
    widthCm: cache.widthCm ?? undefined,
    heightCm: cache.heightCm ?? undefined,
    priceEur: cache.priceEur ?? undefined,
    isOriginalTagged: cache.isOriginalTagged ?? undefined,
    shortDescription: cache.shortDescription ?? undefined,
  };
}
