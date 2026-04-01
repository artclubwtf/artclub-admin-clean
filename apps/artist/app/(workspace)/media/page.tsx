import { MediaLibrary } from "@/components/media/MediaLibrary";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistMediaV2Model } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MediaPage() {
  const context = await requireArtistContext();
  const media = await ArtistMediaV2Model.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ createdAt: -1 })
    .lean();

  return (
    <MediaLibrary
      initialMedia={media.map((item) => ({
        id: item._id.toString(),
        kind: item.kind,
        url: item.url,
        previewUrl: item.previewUrl || item.url,
        filename: item.filename || "",
        mimeType: item.mimeType || "",
        sizeBytes: item.sizeBytes ?? null,
        createdAt: item.createdAt,
      }))}
    />
  );
}
