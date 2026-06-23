import type { ArtistAnnouncementItem, ArtistExhibitionItem, ArtistProfileLinkItem } from "@/lib/types";
import {
  isUpcomingOrOngoingExhibition,
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
} from "@/lib/server/artist-profile-content";
import { normalizePublicArtistMediaUrl, normalizePublicArtistMediaUrls } from "@/lib/server/artist-media";

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

function isShopifyGid(value: string | undefined | null) {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed.startsWith("gid://shopify/"));
}

type RenderableArtistProfileImages = {
  avatarUrl: string;
  heroUrl: string;
  galleryUrls: string[];
  media?: any[];
};

export function resolveRenderableArtistProfileImages(profileImages: any): {
  profileImages: RenderableArtistProfileImages;
  unresolvedGids: Array<{ fieldKey: string; rawValue: string }>;
} {
  const media = Array.isArray(profileImages?.media) ? profileImages.media : [];
  const mediaByGid = new Map<string, any>();
  const mediaByFieldKey = new Map<string, any>();

  for (const item of media) {
    const gidCandidates = [item?.mediaGid, item?.shopifyFileGid].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
    for (const gid of gidCandidates) {
      mediaByGid.set(gid, item);
    }
    const fieldKey = typeof item?.fieldKey === "string" ? item.fieldKey.trim() : "";
    if (fieldKey) {
      mediaByFieldKey.set(fieldKey, item);
    }
  }

  const unresolvedGids: Array<{ fieldKey: string; rawValue: string }> = [];
  const resolveOne = (rawValue: string | undefined | null, fieldKey: string) => {
    const trimmed = rawValue?.trim() || "";
    if (!trimmed) return "";
    if (!isShopifyGid(trimmed)) return trimmed;
    const mediaItem = mediaByGid.get(trimmed) || mediaByFieldKey.get(fieldKey);
    const resolvedUrl = typeof mediaItem?.url === "string" ? mediaItem.url.trim() : "";
    if (resolvedUrl) return resolvedUrl;
    unresolvedGids.push({ fieldKey, rawValue: trimmed });
    return "";
  };

  const galleryFieldKeys = ["bild_1", "bild_2", "bild_3"];
  return {
    profileImages: {
      ...(profileImages || {}),
      avatarUrl: resolveOne(profileImages?.avatarUrl, "bild_1"),
      heroUrl: resolveOne(profileImages?.heroUrl, "bilder"),
      galleryUrls: (Array.isArray(profileImages?.galleryUrls) ? profileImages.galleryUrls : [])
        .map((value: string, index: number) => resolveOne(value, galleryFieldKeys[index] || `gallery_${index}`))
        .filter((value: string) => Boolean(value)),
    },
    unresolvedGids,
  };
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
  rewriteMediaUrl?: (value: string | undefined | null) => string;
}) {
  const rewriteMediaUrl = input.rewriteMediaUrl || ((value: string | undefined | null) => normalizePublicArtistMediaUrl(value));
  const exhibitions = serializeExhibitions(input.artist?.exhibitions)
    .filter((item) => item.visibility === "public")
    .map((item) => ({
      ...item,
      coverImageUrl: rewriteMediaUrl(item.coverImageUrl),
    }));
  const links = mergeLegacyLinks({
    links: serializeProfileLinks(input.artist?.profileLinks).filter((item: ArtistProfileLinkItem) => item.isVisible),
    websiteUrl: input.artist?.websiteUrl,
    instagram: input.artist?.instagram,
  });

  return {
    handle: input.artist?.handle || "",
    displayName: input.artist?.displayName || "",
    bio: input.artist?.bio || input.artist?.introduction || input.artist?.longText || "",
    quote: input.artist?.quote || "",
    introduction: input.artist?.introduction || "",
    longText: input.artist?.longText || "",
    profileImages: {
      avatarUrl: rewriteMediaUrl(input.artist?.profileImages?.avatarUrl || ""),
      heroUrl: rewriteMediaUrl(input.artist?.profileImages?.heroUrl || ""),
      galleryUrls: normalizePublicArtistMediaUrls(
        (Array.isArray(input.artist?.profileImages?.galleryUrls) ? input.artist.profileImages.galleryUrls : []).map((value: string) =>
          rewriteMediaUrl(value),
        ),
      ),
    },
    links,
    socialLinks: links.filter((item) => ["instagram", "website", "linkedin", "tiktok", "youtube", "behance"].includes(item.type)).slice(0, 5),
    experience: serializeExperience(input.artist?.experience).map((item) => ({
      ...item,
      imageUrl: rewriteMediaUrl(item.imageUrl),
    })),
    education: serializeEducation(input.artist?.education).map((item) => ({
      ...item,
      imageUrl: rewriteMediaUrl(item.imageUrl),
    })),
    exhibitions,
    exhibitionHistory: exhibitions.filter((item: ArtistExhibitionItem) => !isUpcomingOrOngoingExhibition(item)),
    upcomingExhibitions: exhibitions.filter((item: ArtistExhibitionItem) => isUpcomingOrOngoingExhibition(item)),
    announcements: input.announcements.filter(isActiveAnnouncement),
  };
}
