import type { ArtistAnnouncementItem, ArtistExhibitionItem, ArtistProfileLinkItem } from "@/lib/types";
import {
  isUpcomingOrOngoingExhibition,
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
} from "@/lib/server/artist-profile-content";
import { normalizePublicArtistMediaUrl, normalizePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { resolveShopifyMediaImageGids, type ResolvedShopifyMediaImage } from "@/lib/server/shopify-media";

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

export async function resolveRenderableArtistProfileImages(profileImages: any, options?: { resolveGids?: (ids: string[]) => Promise<{ lookup: Record<string, ResolvedShopifyMediaImage>; unresolved: string[]; error: string | null }> }): Promise<{
  profileImages: RenderableArtistProfileImages;
  unresolvedGids: Array<{ fieldKey: string; rawValue: string }>;
  resolutionError: string | null;
}> {
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

  const pending = new Map<string, string[]>();
  const resolveCached = (rawValue: string | undefined | null, fieldKey: string) => {
    const trimmed = rawValue?.trim() || "";
    if (!trimmed) return "";
    if (!isShopifyGid(trimmed)) return trimmed;
    const mediaItem = mediaByGid.get(trimmed) || mediaByFieldKey.get(fieldKey);
    const resolvedUrl = typeof mediaItem?.url === "string" ? mediaItem.url.trim() : "";
    if (resolvedUrl) return resolvedUrl;
    pending.set(trimmed, [...(pending.get(trimmed) || []), fieldKey]);
    return "";
  };

  const galleryFieldKeys = ["bild_1", "bild_2", "bild_3"];
  const avatarUrl = resolveCached(profileImages?.avatarUrl, "bild_1");
  const heroUrl = resolveCached(profileImages?.heroUrl, "bilder");
  const gallery = (Array.isArray(profileImages?.galleryUrls) ? profileImages.galleryUrls : []).map((value: string, index: number) => ({ value, fieldKey: galleryFieldKeys[index] || `gallery_${index}`, cached: resolveCached(value, galleryFieldKeys[index] || `gallery_${index}`) }));
  const resolved = pending.size ? await (options?.resolveGids || resolveShopifyMediaImageGids)([...pending.keys()]) : { lookup: {}, unresolved: [], error: null };
  const finalUrl = (raw: string | undefined | null, cached: string) => cached || resolved.lookup[raw?.trim() || ""]?.url || "";
  const unresolvedGids = [...pending.entries()].flatMap(([rawValue, fields]) => resolved.lookup[rawValue] ? [] : fields.map(fieldKey => ({ fieldKey, rawValue })));
  return {
    profileImages: {
      ...(profileImages || {}),
      avatarUrl: finalUrl(profileImages?.avatarUrl, avatarUrl),
      heroUrl: finalUrl(profileImages?.heroUrl, heroUrl),
      galleryUrls: gallery
        .map((item: { value: string; fieldKey: string; cached: string }) => finalUrl(item.value, item.cached))
        .filter((value: string) => Boolean(value)),
    },
    unresolvedGids,
    resolutionError: resolved.error,
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
