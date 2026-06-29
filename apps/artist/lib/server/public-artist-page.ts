import { connectMongo } from "@/lib/server/mongodb";
import { normalizePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { createArtistMediaUrlRewriter } from "@/lib/server/artist-media-rewrite";
import { buildPublicArtistProfileShape, resolveRenderableArtistProfileImages } from "@/lib/server/public-artist-profile";
import { ArtistAnnouncementModel, CanonicalArtistModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";
import { logArtistProfileRender } from "../../../admin/lib/sync/syncLogger";
import type { PublicArtistArtworkItem, PublicArtistProfilePageData } from "@/lib/types";

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

export async function loadPublicArtistPageBySlug(rawSlug: string): Promise<PublicArtistProfilePageData | null> {
  const slug = rawSlug.trim();
  if (!slug) return null;

  await connectMongo();

  const artist = await CanonicalArtistModel.findOne({
    $or: [
      { publicSlug: { $regex: `^${escapeRegex(slug)}$`, $options: "i" } },
      { handle: { $regex: `^${escapeRegex(slug)}$`, $options: "i" } },
    ],
    "publicProfile.isVisible": { $ne: false },
  }).lean();

  if (!artist) return null;

  const { profileImages: renderableProfileImages, unresolvedGids } = resolveRenderableArtistProfileImages(artist.profileImages);
  for (const unresolved of unresolvedGids) {
    logArtistProfileRender("artist_profile_image_gid_without_url", {
      service: "artist",
      canonicalArtistId: String(artist._id),
      publicSlug: artist.publicSlug || artist.handle || slug,
      fieldKey: unresolved.fieldKey,
      rawValue: unresolved.rawValue,
    });
  }
  const renderableArtist = {
    ...artist,
    profileImages: renderableProfileImages,
  };

  const [announcements, artworks] = await Promise.all([
    ArtistAnnouncementModel.find({
      shopDomain: artist.shopDomain,
      artistKey: artist.artistKey,
      isPublished: true,
    })
      .sort({ isPinned: -1, sortOrder: 1, createdAt: -1 })
      .lean(),
    CanonicalProductModel.find({
      shopDomain: artist.shopDomain,
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
      .lean(),
  ]);

  const rewriteMediaUrl = await createArtistMediaUrlRewriter({
    shopDomain: artist.shopDomain,
    artistKey: artist.artistKey,
    candidateUrls: [
      renderableArtist.profileImages?.avatarUrl,
      renderableArtist.profileImages?.heroUrl,
      ...(Array.isArray(renderableArtist.profileImages?.galleryUrls) ? renderableArtist.profileImages.galleryUrls : []),
      ...(Array.isArray(artist.experience) ? artist.experience.map((item: any) => item?.imageUrl) : []),
      ...(Array.isArray(artist.education) ? artist.education.map((item: any) => item?.imageUrl) : []),
      ...(Array.isArray(artist.exhibitions) ? artist.exhibitions.map((item: any) => item?.coverImageUrl) : []),
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
        shopDomain: artist.shopDomain,
        productKey: { $in: artworks.map((item) => item.productKey) },
      })
        .select({ productKey: 1, priceCents: 1, finish: 1, sizeCode: 1 })
        .lean()
    : [];

  const profile = buildPublicArtistProfileShape({
    artist: renderableArtist,
    announcements: announcements.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      body: item.body || "",
      ctaLabel: item.ctaLabel || "",
      ctaUrl: item.ctaUrl || "",
      startsAt: item.startsAt ? new Date(item.startsAt).toISOString().slice(0, 10) : "",
      endsAt: item.endsAt ? new Date(item.endsAt).toISOString().slice(0, 10) : "",
      isPinned: item.isPinned === true,
      isPublished: item.isPublished === true,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    rewriteMediaUrl,
  });

  const variantsByProduct = variants.reduce<Record<string, typeof variants>>((acc, item) => {
    const key = item.productKey || "";
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const publicArtworks: PublicArtistArtworkItem[] = artworks
    .filter((item) => item.title && (item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl))
    .map((item) => {
      const galleryUrls = Array.isArray(item.images?.galleryUrls) ? item.images.galleryUrls.filter(Boolean) : [];
      const variantsForProduct = variantsByProduct[item.productKey] || [];
      const productHandle = item.handle || "";
      return {
        canonicalProductId: item._id.toString(),
        productKey: item.productKey,
        productHandle,
        shopifyProductId: item.shopifyProductId || "",
        shopifyProductUrl: productHandle ? `https://${artist.shopDomain}/products/${productHandle}` : "",
        title: item.title,
        year: item.year ?? null,
        description: item.description || "",
        imageUrl: rewriteMediaUrl(item.images?.mediumUrl || item.images?.thumbUrl || item.images?.originalUrl || ""),
        galleryUrls: normalizePublicArtistMediaUrls(galleryUrls.map((value) => rewriteMediaUrl(value))),
        seriesName: item.seriesName || "",
        status: item.status,
        priceLabel: buildArtworkPriceLabel({
          forSale: item.forSale !== false,
          originalAvailable: item.originalAvailable === true,
          allowPrints: item.allowPrints === true,
          variants: variantsForProduct,
        }),
        detailLabel: "more about the artwork",
      };
    });

  const result = {
    canonicalArtistId: artist._id.toString(),
    slug: profile.handle || slug,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.profileImages.avatarUrl || profile.profileImages.galleryUrls[0] || publicArtworks[0]?.imageUrl || "",
    heroUrl: profile.profileImages.heroUrl || profile.profileImages.galleryUrls[0] || publicArtworks[0]?.imageUrl || "",
    socialLinks: profile.socialLinks || [],
    links: profile.links || [],
    artworks: publicArtworks,
    upcomingExhibitions: profile.upcomingExhibitions || [],
    exhibitionHistory: profile.exhibitionHistory || [],
    education: profile.education || [],
    experience: profile.experience || [],
    announcements: profile.announcements || [],
  };

  logArtistProfileRender("artist_profile_render_data", {
    service: "artist",
    canonicalArtistId: String(artist._id),
    publicSlug: artist.publicSlug || artist.handle || slug,
    displayName: profile.displayName,
    coverImageUrl: result.heroUrl || "",
    galleryImageCount: profile.profileImages.galleryUrls.length,
    galleryImageUrls: profile.profileImages.galleryUrls,
    hasIntro: Boolean(profile.introduction),
    hasLongText: Boolean(profile.longText),
    hasInstagram: profile.socialLinks.some((item) => item.type === "instagram"),
    artworkCount: publicArtworks.length,
  });

  return result;
}
