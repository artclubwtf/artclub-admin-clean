import { AnnouncementsManager } from "@/components/announcements/AnnouncementsManager";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistAnnouncementModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AnnouncementsPage() {
  const context = await requireArtistContext();
  const announcements = await ArtistAnnouncementModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  return (
    <AnnouncementsManager
      initialItems={announcements.map((item) => ({
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
      }))}
    />
  );
}
