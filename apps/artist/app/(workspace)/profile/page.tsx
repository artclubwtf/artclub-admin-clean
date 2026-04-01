import { ProfileForm } from "@/components/profile/ProfileForm";
import { normalizePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { createArtistMediaUrlRewriter } from "@/lib/server/artist-media-rewrite";
import {
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
} from "@/lib/server/artist-profile-content";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistAnnouncementModel, CanonicalArtistModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";

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

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireArtistContext();
  const resolvedSearchParams = (await searchParams) || {};
  const createIntent = Array.isArray(resolvedSearchParams.create)
    ? resolvedSearchParams.create[0]
    : resolvedSearchParams.create;
  const [artist, announcements, artworks] = await Promise.all([
    CanonicalArtistModel.findById(context.canonicalArtist._id).lean(),
    ArtistAnnouncementModel.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean(),
    CanonicalProductModel.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      type: "artwork",
      status: { $ne: "archived" },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select({
        productKey: 1,
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
      .limit(12)
      .lean(),
  ]);

  const variants = artworks.length
    ? await CanonicalVariantModel.find({
        shopDomain: context.user.shopDomain,
        productKey: { $in: artworks.map((item) => item.productKey) },
      })
        .select({ productKey: 1, priceCents: 1, finish: 1, sizeCode: 1 })
        .lean()
    : [];

  const rewriteMediaUrl = await createArtistMediaUrlRewriter({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    candidateUrls: [
      artist?.profileImages?.avatarUrl,
      artist?.profileImages?.heroUrl,
      ...(Array.isArray(artist?.profileImages?.galleryUrls) ? artist?.profileImages?.galleryUrls : []),
      ...(Array.isArray(artist?.experience) ? artist.experience.map((item: any) => item?.imageUrl) : []),
      ...(Array.isArray(artist?.education) ? artist.education.map((item: any) => item?.imageUrl) : []),
      ...(Array.isArray(artist?.exhibitions) ? artist.exhibitions.map((item: any) => item?.coverImageUrl) : []),
      ...artworks.flatMap((item) => [
        item.images?.thumbUrl,
        item.images?.mediumUrl,
        item.images?.originalUrl,
        ...(Array.isArray(item.images?.galleryUrls) ? item.images.galleryUrls : []),
      ]),
    ],
  });

  const serializedAnnouncements = announcements.map((item) => ({
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
  }));
  const variantsByProduct = variants.reduce<Record<string, typeof variants>>((acc, item) => {
    const key = item.productKey || "";
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const artworksPreview = artworks
    .filter((item) => item.title && (item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl))
    .map((item) => {
      const galleryUrls = Array.isArray(item.images?.galleryUrls) ? item.images.galleryUrls.filter(Boolean) : [];
      const variantsForProduct = variantsByProduct[item.productKey] || [];

      return {
        productKey: item.productKey,
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

  return (
    <ProfileForm
      initialProfile={{
        artistKey: context.user.artistKey,
        email: context.user.email,
        displayName: context.canonicalArtist.displayName || context.user.name || "",
        handle: context.canonicalArtist.handle || context.user.artistKey,
        locationCity: context.canonicalArtist.locationCity || "",
        locationCountry: context.canonicalArtist.locationCountry || "",
        bio: context.canonicalArtist.bio || "",
        publicProfileVisible: artist?.publicProfile?.isVisible !== false,
        profileImages: {
          avatarUrl: rewriteMediaUrl(context.canonicalArtist.profileImages?.avatarUrl || ""),
          heroUrl: rewriteMediaUrl(context.canonicalArtist.profileImages?.heroUrl || ""),
          galleryUrls: Array.isArray(context.canonicalArtist.profileImages?.galleryUrls)
            ? context.canonicalArtist.profileImages.galleryUrls.map((value) => rewriteMediaUrl(value))
            : [],
        },
        profileLinks: serializeProfileLinks(artist?.profileLinks),
        experience: serializeExperience(artist?.experience).map((item) => ({ ...item, imageUrl: rewriteMediaUrl(item.imageUrl) })),
        education: serializeEducation(artist?.education).map((item) => ({ ...item, imageUrl: rewriteMediaUrl(item.imageUrl) })),
        exhibitions: serializeExhibitions(artist?.exhibitions).map((item) => ({ ...item, coverImageUrl: rewriteMediaUrl(item.coverImageUrl) })),
      }}
      artworksPreview={artworksPreview}
      initialAnnouncements={serializedAnnouncements}
      initialCreateIntent={createIntent || ""}
    />
  );
}
