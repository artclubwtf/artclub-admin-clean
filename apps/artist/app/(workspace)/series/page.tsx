import { SeriesManager } from "@/components/series/SeriesManager";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistSeriesModel, CanonicalProductModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SeriesPage() {
  const context = await requireArtistContext();

  const [series, artworks] = await Promise.all([
    ArtistSeriesModel.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    })
      .sort({ updatedAt: -1 })
      .lean(),
    CanonicalProductModel.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      type: "artwork",
      seriesId: { $exists: true, $ne: null },
    })
      .select({ seriesId: 1 })
      .lean(),
  ]);

  const counts = artworks.reduce<Record<string, number>>((acc, item) => {
    const key = item.seriesId || "";
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <SeriesManager
      initialSeries={series.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description || "",
        coverImageUrl: item.coverImageUrl || "",
        artworkCount: counts[item._id.toString()] || 0,
      }))}
    />
  );
}
