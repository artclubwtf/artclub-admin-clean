import { notFound } from "next/navigation";

import { ArtworkForm } from "@/components/artworks/ArtworkForm";
import { requireArtistContext } from "@/lib/server/artist-context";
import { parseArtistMediaIdFromUrl, resolveArtistMediaUrls } from "@/lib/server/artist-media";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";
import { artistProductOwnershipFilter } from "@/lib/server/product-ownership";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function EditArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireArtistContext();
  const { id } = await params;

  const [artwork, variants, series] = await Promise.all([
    CanonicalProductModel.findOne({
      ...artistProductOwnershipFilter(context),
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

  const originalVariant = variants.find((variant) => variant.finish === "original");

  const galleryUrls = Array.isArray(artwork.images?.galleryUrls) ? artwork.images.galleryUrls : [];
  const galleryMediaIds = galleryUrls.map((url) => parseArtistMediaIdFromUrl(url)).filter(Boolean) as string[];
  const linkedMedia = galleryUrls.length
    ? await ArtistMediaV2Model.find({
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        $or: [
          ...(galleryMediaIds.length ? [{ _id: { $in: galleryMediaIds } }] : []),
          { url: { $in: galleryUrls } },
          { previewUrl: { $in: galleryUrls } },
        ],
      }).lean()
    : [];

  const mediaItems = galleryUrls.map((url, index) => {
    const matched = linkedMedia.find((item) => item.url === url || item.previewUrl === url);
    return {
      id: matched?._id.toString() || "",
      kind: "artwork" as const,
      s3Key: matched?.s3Key || "",
      url: matched ? resolveArtistMediaUrls(matched).url : url,
      previewUrl: matched ? resolveArtistMediaUrls(matched).previewUrl : url,
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
        originalWidthCm: artwork.dimensions?.widthCm ?? null,
        originalHeightCm: artwork.dimensions?.heightCm ?? null,
        originalPriceCents: originalVariant?.priceCents ?? null,
        forSale: artwork.forSale !== false,
        originalAvailable: artwork.originalAvailable === true,
        printsEnabled: artwork.allowPrints === true,
        seriesId: artwork.seriesId || "",
        printSizeCodes: Array.from(new Set(variants.filter((variant) => variant.finish !== "original").map((variant) => variant.sizeCode))),
        mediaItems,
      }}
      series={series.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description || "",
        coverImageUrl: item.coverImageUrl || "",
      }))}
    />
  );
}
