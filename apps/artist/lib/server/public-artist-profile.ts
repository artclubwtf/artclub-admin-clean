import type { ArtistAnnouncementItem, ArtistExhibitionItem, ArtistProfileLinkItem } from "@/lib/types";
import {
  isUpcomingOrOngoingExhibition,
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
} from "@/lib/server/artist-profile-content";

function isActiveAnnouncement(item: ArtistAnnouncementItem) {
  if (!item.isPublished) return false;
  const now = Date.now();
  const startsAt = item.startsAt ? Date.parse(item.startsAt) : null;
  const endsAt = item.endsAt ? Date.parse(item.endsAt) : null;
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;
  return true;
}

function normalizeUrl(url: string) {
  return url.trim().toLowerCase();
}

function mergeLegacyLinks(input: {
  links: ArtistProfileLinkItem[];
  websiteUrl?: string;
  instagram?: string;
}) {
  const current = [...input.links];
  const seen = new Set(current.map((item) => normalizeUrl(item.url)));

  if (input.websiteUrl?.trim()) {
    const url = input.websiteUrl.trim();
    if (!seen.has(normalizeUrl(url))) {
      current.push({
        id: `legacy-website-${url}`,
        label: "Website",
        url,
        type: "website",
        sortOrder: current.length,
        isVisible: true,
        isHighlighted: false,
      });
      seen.add(normalizeUrl(url));
    }
  }

  if (input.instagram?.trim()) {
    const raw = input.instagram.trim();
    const url = raw.startsWith("http") ? raw : `https://instagram.com/${raw.replace(/^@/, "")}`;
    if (!seen.has(normalizeUrl(url))) {
      current.push({
        id: `legacy-instagram-${url}`,
        label: "Instagram",
        url,
        type: "instagram",
        sortOrder: current.length,
        isVisible: true,
        isHighlighted: false,
      });
      seen.add(normalizeUrl(url));
    }
  }

  return current;
}

export function buildPublicArtistProfileShape(input: {
  artist: any;
  announcements: ArtistAnnouncementItem[];
}) {
  const exhibitions = serializeExhibitions(input.artist?.exhibitions).filter((item) => item.visibility === "public");
  const links = mergeLegacyLinks({
    links: serializeProfileLinks(input.artist?.profileLinks).filter((item: ArtistProfileLinkItem) => item.isVisible),
    websiteUrl: input.artist?.websiteUrl,
    instagram: input.artist?.instagram,
  });

  return {
    handle: input.artist?.handle || "",
    displayName: input.artist?.displayName || "",
    bio: input.artist?.bio || "",
    profileImages: {
      avatarUrl: input.artist?.profileImages?.avatarUrl || "",
      heroUrl: input.artist?.profileImages?.heroUrl || "",
      galleryUrls: Array.isArray(input.artist?.profileImages?.galleryUrls) ? input.artist.profileImages.galleryUrls : [],
    },
    links,
    socialLinks: links.filter((item) => ["instagram", "website", "linkedin", "tiktok", "youtube", "behance"].includes(item.type)).slice(0, 5),
    experience: serializeExperience(input.artist?.experience),
    education: serializeEducation(input.artist?.education),
    exhibitions,
    exhibitionHistory: exhibitions.filter((item: ArtistExhibitionItem) => !isUpcomingOrOngoingExhibition(item)),
    upcomingExhibitions: exhibitions.filter((item: ArtistExhibitionItem) => isUpcomingOrOngoingExhibition(item)),
    announcements: input.announcements.filter(isActiveAnnouncement),
  };
}
