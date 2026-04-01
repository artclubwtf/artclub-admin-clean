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

export function buildPublicArtistProfileShape(input: {
  artist: any;
  announcements: ArtistAnnouncementItem[];
}) {
  const exhibitions = serializeExhibitions(input.artist?.exhibitions).filter((item) => item.visibility === "public");

  return {
    handle: input.artist?.handle || "",
    displayName: input.artist?.displayName || "",
    bio: input.artist?.bio || "",
    profileImages: {
      avatarUrl: input.artist?.profileImages?.avatarUrl || "",
      heroUrl: input.artist?.profileImages?.heroUrl || "",
      galleryUrls: Array.isArray(input.artist?.profileImages?.galleryUrls) ? input.artist.profileImages.galleryUrls : [],
    },
    links: serializeProfileLinks(input.artist?.profileLinks).filter((item: ArtistProfileLinkItem) => item.isVisible),
    experience: serializeExperience(input.artist?.experience),
    education: serializeEducation(input.artist?.education),
    exhibitions,
    exhibitionHistory: exhibitions.filter((item: ArtistExhibitionItem) => !isUpcomingOrOngoingExhibition(item)),
    upcomingExhibitions: exhibitions.filter((item: ArtistExhibitionItem) => isUpcomingOrOngoingExhibition(item)),
    announcements: input.announcements.filter(isActiveAnnouncement),
  };
}
