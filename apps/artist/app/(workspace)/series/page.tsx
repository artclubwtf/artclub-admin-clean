import { SeriesManager } from "@/components/series/SeriesManager";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistSeriesModel, CanonicalProductModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SeriesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireArtistContext();
  const resolvedSearchParams = (await searchParams) || {};
  const createIntent = Array.isArray(resolvedSearchParams.create)
    ? resolvedSearchParams.create[0]
    : resolvedSearchParams.create;

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
    })
      .select({ productKey: 1, title: 1, seriesId: 1, images: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
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
        artworkProductKeys: artworks.filter((artwork) => artwork.seriesId === item._id.toString()).map((artwork) => artwork.productKey),
      }))}
      artworks={artworks.map((item) => ({
        productKey: item.productKey,
        title: item.title,
        imageUrl: item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl || "",
        assignedSeriesId: item.seriesId || "",
      }))}
      initialOpenCreate={createIntent === "1" || createIntent === "true" || createIntent === "series"}
    />
  );
}
