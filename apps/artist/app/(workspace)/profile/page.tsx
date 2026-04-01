import { ProfileForm } from "@/components/profile/ProfileForm";
import { createArtistMediaUrlRewriter } from "@/lib/server/artist-media-rewrite";
import { buildPublicArtistProfileShape } from "@/lib/server/public-artist-profile";
import {
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
} from "@/lib/server/artist-profile-content";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistAnnouncementModel, CanonicalArtistModel, CanonicalProductModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProfilePage() {
  const context = await requireArtistContext();
  const [artist, announcements, featuredWorks] = await Promise.all([
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
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select({ productKey: 1, title: 1, seriesName: 1, status: 1, images: 1 })
      .limit(4)
      .lean(),
  ]);

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
      ...featuredWorks.flatMap((item) => [
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
  const publicProfile = buildPublicArtistProfileShape({
    artist,
    announcements: serializedAnnouncements,
    rewriteMediaUrl,
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
      featuredWorks={featuredWorks.map((item) => ({
        productKey: item.productKey,
        title: item.title,
        seriesName: item.seriesName || "",
        imageUrl: rewriteMediaUrl(item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl || ""),
        status: item.status,
      }))}
      announcementPreview={publicProfile.announcements.slice(0, 3)}
    />
  );
}
