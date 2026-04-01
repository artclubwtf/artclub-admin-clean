import { notFound } from "next/navigation";

import { ArtworkForm } from "@/components/artworks/ArtworkForm";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ARTIST_PRINT_SIZES } from "@/lib/server/artist-print-pricing";
import { connectMongo } from "@/lib/server/mongodb";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function EditArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
  const context = await requireArtistContext();
  const { id } = await params;

  const [artwork, variants, series] = await Promise.all([
    CanonicalProductModel.findOne({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      type: "artwork",
      productKey: id,
    }).lean(),
    CanonicalVariantModel.find({
      shopDomain: context.user.shopDomain,
      productKey: id,
    }).lean(),
    ArtistSeriesModel.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    })
      .sort({ name: 1 })
      .lean(),
  ]);

  if (!artwork) notFound();

  const galleryUrls = Array.isArray(artwork.images?.galleryUrls) ? artwork.images.galleryUrls : [];
  const linkedMedia = galleryUrls.length
    ? await ArtistMediaV2Model.find({
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        $or: [{ url: { $in: galleryUrls } }, { previewUrl: { $in: galleryUrls } }],
      }).lean()
    : [];

  const mediaItems = galleryUrls.map((url, index) => {
    const matched = linkedMedia.find((item) => item.url === url || item.previewUrl === url);
    return {
      id: matched?._id.toString() || "",
      kind: "artwork" as const,
      url,
      previewUrl: matched?.previewUrl || url,
      filename: matched?.filename || `Artwork ${index + 1}`,
    };
  });

  return (
    <ArtworkForm
      mode="edit"
      productKey={artwork.productKey}
      initialValue={{
        title: artwork.title,
        description: artwork.description || "",
        year: artwork.year ?? null,
        widthCm: artwork.dimensions?.widthCm ?? null,
        heightCm: artwork.dimensions?.heightCm ?? null,
        forSale: artwork.forSale !== false,
        originalAvailable: artwork.originalAvailable === true,
        printsEnabled: artwork.allowPrints === true,
        seriesId: artwork.seriesId || "",
        printSizeCodes: variants.filter((variant) => variant.finish === "print").map((variant) => variant.sizeCode),
        mediaItems,
      }}
      series={series.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description || "",
        coverImageUrl: item.coverImageUrl || "",
      }))}
      printSizes={ARTIST_PRINT_SIZES.map((item) => ({ code: item.code, label: item.label }))}
    />
  );
}
