import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { getPublicS3Url } from "@/lib/s3";
import { resolveShopDomain } from "@/lib/shopDomain";
import { ArtistMediaV2Model } from "@/models/ArtistMediaV2";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

function trim(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, cents) / 100);
}

function buildArtworkPriceLabel(params: {
  forSale: boolean;
  originalAvailable: boolean;
  allowPrints: boolean;
  variants: Array<{ priceCents: number; finish?: string; sizeCode?: string }>;
}) {
  if (!params.forSale) return "Not for Sale at ARTCLUB";

  const originalVariant = params.variants.find((item) => item.finish === "original" && item.priceCents > 0);
  const printVariants = params.variants.filter((item) => item.finish !== "original" && item.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents);
  const cheapestPrint = printVariants[0];

  if (params.allowPrints && cheapestPrint) return `From ${formatCurrency(cheapestPrint.priceCents)}`;
  if (params.originalAvailable && originalVariant) return formatCurrency(originalVariant.priceCents);
  if (params.originalAvailable) return "Available on request";
  if (params.allowPrints) return "Prints available";
  return "Not for Sale at ARTCLUB";
}

function normalizeUrl(url: string) {
  return url.trim().toLowerCase();
}

function parseArtistMediaIdFromUrl(value: string | undefined | null) {
  if (!value) return null;
  const match = value.match(/\/api\/(?:artist\/media|public\/artist-media)\/([a-fA-F0-9]{24})(?:\/file)?(?:[/?#]|$)/);
  return match?.[1] || null;
}

function absolutizeUrl(value: string, baseUrl: string) {
  const url = trim(value);
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function isShopifyGid(value: string | undefined | null) {
  const trimmed = trim(value);
  return Boolean(trimmed && trimmed.startsWith("gid://shopify/"));
}

function resolveRenderableArtistProfileImages(profileImages: any): {
  avatarUrl: string;
  heroUrl: string;
  galleryUrls: string[];
} {
  const media = Array.isArray(profileImages?.media) ? profileImages.media : [];
  const mediaByGid = new Map<string, any>();
  const mediaByFieldKey = new Map<string, any>();

  for (const item of media) {
    const gidCandidates = [item?.mediaGid, item?.shopifyFileGid].map((value) => trim(value)).filter(Boolean);
    for (const gid of gidCandidates) {
      mediaByGid.set(gid, item);
    }
    const fieldKey = trim(item?.fieldKey);
    if (fieldKey) {
      mediaByFieldKey.set(fieldKey, item);
    }
  }

  const resolveOne = (rawValue: string | undefined | null, fieldKey: string) => {
    const normalized = trim(rawValue);
    if (!normalized) return "";
    if (!isShopifyGid(normalized)) return normalized;
    const mediaItem = mediaByGid.get(normalized) || mediaByFieldKey.get(fieldKey);
    return trim(mediaItem?.url);
  };

  const galleryFieldKeys = ["bild_1", "bild_2", "bild_3"];
  return {
    avatarUrl: resolveOne(profileImages?.avatarUrl, "bild_1"),
    heroUrl: resolveOne(profileImages?.heroUrl, "bilder"),
    galleryUrls: (Array.isArray(profileImages?.galleryUrls) ? profileImages.galleryUrls : [])
      .map((value: string, index: number) => resolveOne(value, galleryFieldKeys[index] || `gallery_${index}`))
      .filter(Boolean),
  };
}

async function createMediaUrlRewriter(input: {
  shopDomain: string;
  artistKey: string;
  candidateUrls: Array<string | undefined | null>;
}) {
  const urls = Array.from(new Set(input.candidateUrls.map((value) => trim(value)).filter(Boolean))) as string[];
  const ids = Array.from(new Set(urls.map((value) => parseArtistMediaIdFromUrl(value)).filter(Boolean))) as string[];

  if (!urls.length && !ids.length) {
    return (value: string | undefined | null) => trim(value);
  }

  const orFilters: Record<string, unknown>[] = [];
  const objectIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  if (objectIds.length) {
    orFilters.push({ _id: { $in: objectIds } });
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
        .select({ _id: 1, url: 1, previewUrl: 1, s3Key: 1 })
        .lean()
    : [];

  const map = new Map<string, string>();
  for (const doc of docs) {
    const publicUrl = trim(getPublicS3Url(trim(doc.s3Key)) || trim(doc.url) || trim(doc.previewUrl));
    if (!publicUrl) continue;
    map.set(doc._id.toString(), publicUrl);
    if (trim(doc.url)) map.set(trim(doc.url), publicUrl);
    if (trim(doc.previewUrl)) map.set(trim(doc.previewUrl), publicUrl);
  }

  return (value: string | undefined | null) => {
    const normalized = trim(value);
    if (!normalized) return "";
    const direct = map.get(normalized);
    if (direct) return direct;
    const id = parseArtistMediaIdFromUrl(normalized);
    if (id) return map.get(id) || normalized;
    return normalized;
  };
}

function buildArtistLinks(artist: any) {
  type ArtistLink = {
    id: string;
    label: string;
    url: string;
    type: string;
  };

  const current = (Array.isArray(artist?.profileLinks) ? artist.profileLinks : [])
    .filter((item: any) => item && item.isVisible !== false && trim(item.url))
    .map((item: any): ArtistLink => ({
      id: trim(item.id) || `link-${trim(item.url)}`,
      label: trim(item.label) || trim(item.type) || "Link",
      url: trim(item.url),
      type: trim(item.type) || "website",
    }));

  const seen = new Set(current.map((item: ArtistLink) => normalizeUrl(item.url)));

  const websiteUrl = trim(artist?.websiteUrl);
  if (websiteUrl && !seen.has(normalizeUrl(websiteUrl))) {
    current.push({ id: `legacy-website-${websiteUrl}`, label: "Website", url: websiteUrl, type: "website" });
    seen.add(normalizeUrl(websiteUrl));
  }

  const instagramValue = trim(artist?.instagram);
  if (instagramValue) {
    const instagramUrl = instagramValue.startsWith("http") ? instagramValue : `https://instagram.com/${instagramValue.replace(/^@/, "")}`;
    if (!seen.has(normalizeUrl(instagramUrl))) {
      current.push({ id: `legacy-instagram-${instagramUrl}`, label: "Instagram", url: instagramUrl, type: "instagram" });
    }
  }

  return current;
}

export async function loadPublicArtistEmbed(slug: string, requestBaseUrl: string) {
  const normalizedSlug = trim(slug);
  if (!normalizedSlug) return null;

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    throw new Error("Missing Shopify shop domain");
  }

  await connectMongo();

  const artist = await CanonicalArtistModel.findOne({
    shopDomain,
    $or: [
      { publicSlug: { $regex: `^${escapeRegex(normalizedSlug)}$`, $options: "i" } },
      { handle: { $regex: `^${escapeRegex(normalizedSlug)}$`, $options: "i" } },
    ],
    "publicProfile.isVisible": { $ne: false },
  }).lean();

  if (!artist) return null;

  const renderableProfileImages = resolveRenderableArtistProfileImages(artist.profileImages);

  const artworks = await CanonicalProductModel.find({
    shopDomain,
    canonicalArtistId: artist._id,
    type: "artwork",
    status: { $in: ["active", "shopify_synced"] },
    approvalStatus: { $in: ["published", "approved"] },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select({
      _id: 1,
      productKey: 1,
      handle: 1,
      shopifyProductId: 1,
      title: 1,
      description: 1,
      year: 1,
      forSale: 1,
      originalAvailable: 1,
      allowPrints: 1,
      seriesName: 1,
      status: 1,
      images: 1,
    })
    .lean();

  const rewriteMediaUrl = await createMediaUrlRewriter({
    shopDomain,
    artistKey: artist.artistKey,
    candidateUrls: [
      renderableProfileImages.avatarUrl,
      renderableProfileImages.heroUrl,
      ...renderableProfileImages.galleryUrls,
      ...artworks.flatMap((item) => [
        item.images?.thumbUrl,
        item.images?.mediumUrl,
        item.images?.originalUrl,
        ...(Array.isArray(item.images?.galleryUrls) ? item.images.galleryUrls : []),
      ]),
    ],
  });

  const variants = artworks.length
    ? await CanonicalVariantModel.find({
        shopDomain,
        productKey: { $in: artworks.map((item) => item.productKey) },
      })
        .select({ productKey: 1, priceCents: 1, finish: 1, sizeCode: 1 })
        .lean()
    : [];

  const variantsByProduct = variants.reduce<Record<string, typeof variants>>((acc, item) => {
    const key = trim(item.productKey);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const links = buildArtistLinks(artist);
  const publicArtworks = artworks
    .filter((item) => item.title && (item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl))
    .map((item) => {
      const galleryUrls = Array.isArray(item.images?.galleryUrls) ? item.images.galleryUrls.filter(Boolean) : [];
      const productHandle = trim(item.handle);
      const variantsForProduct = variantsByProduct[item.productKey] || [];

      return {
        canonicalProductId: item._id.toString(),
        productKey: item.productKey,
        productHandle,
        shopifyProductId: trim(item.shopifyProductId),
        shopifyProductUrl: productHandle ? `https://${shopDomain}/products/${productHandle}` : "",
        title: item.title,
        year: item.year ?? null,
        description: trim(item.description),
        imageUrl: absolutizeUrl(rewriteMediaUrl(item.images?.mediumUrl || item.images?.thumbUrl || item.images?.originalUrl || ""), requestBaseUrl),
        galleryUrls: Array.from(new Set(galleryUrls.map((value) => absolutizeUrl(rewriteMediaUrl(value), requestBaseUrl)).filter(Boolean))),
        seriesName: trim(item.seriesName),
        status: trim(item.status),
        priceLabel: buildArtworkPriceLabel({
          forSale: item.forSale !== false,
          originalAvailable: item.originalAvailable === true,
          allowPrints: item.allowPrints === true,
          variants: variantsForProduct,
        }),
      };
    });

  const artistSlug = trim(artist.publicSlug) || trim(artist.handle) || normalizedSlug;
  const avatarUrl = absolutizeUrl(rewriteMediaUrl(renderableProfileImages.avatarUrl), requestBaseUrl);
  const heroUrl = absolutizeUrl(rewriteMediaUrl(renderableProfileImages.heroUrl), requestBaseUrl);
  const fallbackArtworkImage = publicArtworks[0]?.imageUrl || "";

  return {
    artist: {
      canonicalArtistId: artist._id.toString(),
      artistMetaobjectId: trim(artist.shopifyMetaobjectId),
      slug: artistSlug,
      displayName: trim(artist.displayName),
      bio: trim(artist.bio) || trim(artist.introduction) || trim(artist.longText),
      quote: trim(artist.quote),
      introduction: trim(artist.introduction),
      longText: trim(artist.longText),
      avatarUrl: avatarUrl || heroUrl || fallbackArtworkImage,
      heroUrl: heroUrl || avatarUrl || fallbackArtworkImage,
      links,
      socialLinks: links.filter((item: { type: string }) => ["instagram", "website", "linkedin", "tiktok", "youtube", "behance"].includes(item.type)).slice(0, 5),
    },
    artworks: publicArtworks,
  };
}
