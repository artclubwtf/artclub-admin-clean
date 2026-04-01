import { ArtworkForm } from "@/components/artworks/ArtworkForm";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistSeriesModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function NewArtworkPage() {
  const context = await requireArtistContext();
  const series = await ArtistSeriesModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ name: 1 })
    .lean();

  return (
    <ArtworkForm
      mode="create"
      series={series.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description || "",
        coverImageUrl: item.coverImageUrl || "",
      }))}
    />
  );
}
