import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { ArtworkModel } from "@/models/Artwork";
import { ArtistModel } from "@/models/Artist";
import {
  SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
  buildProductMetafieldsForArtwork,
  createDraftArtworkProduct,
  type ShopifyProductMetafieldInput,
} from "@/lib/shopify";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid artwork id" }, { status: 400 });

    await connectMongo();
    const artwork = await ArtworkModel.findById(id).lean();
    if (!artwork) return NextResponse.json({ error: "Artwork not found" }, { status: 404 });

    const artist = await ArtistModel.findById(artwork.artistId).lean();
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    if (!artist.shopifySync?.metaobjectId) {
      return NextResponse.json({ error: "Artist is not synced to Shopify" }, { status: 400 });
    }

    const imageUrls = (artwork.images || []).map((img) => img.url).filter(Boolean) as string[];
    if (imageUrls.length === 0) {
      return NextResponse.json({ error: "Artwork needs public image URLs" }, { status: 400 });
    }

    const additionalMetafields: ShopifyProductMetafieldInput[] = [
      {
        namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
        key: "sale_type",
        type: "single_line_text_field",
        value: artwork.saleType,
      },
    ];
    if (artwork.editionSize) {
      additionalMetafields.push({
        namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
        key: "edition_size",
        type: "number_integer",
        value: artwork.editionSize.toString(),
      });
    }
    const metafields = buildProductMetafieldsForArtwork({
      artistMetaobjectId: artist.shopifySync.metaobjectId,
      kurzbeschreibung: artwork.description || null,
      additional: additionalMetafields,
    });

    const tags = ["artwork"];
    if (artist.shopifySync?.handle) tags.push(`artist:${artist.shopifySync.handle}`);

    const product = await createDraftArtworkProduct({
      title: artwork.title,
      images: imageUrls.map((src) => ({ src })),
      metafields,
      tags,
    });

    await ArtworkModel.findByIdAndUpdate(id, {
      status: "pushed",
      shopify: {
        productId: product.id,
        handle: product.handle,
        lastPushedAt: new Date(),
        lastPushError: null,
      },
    });

    return NextResponse.json({ product }, { status: 200 });
  } catch (err: any) {
    console.error("Failed to push artwork to Shopify", err);
    await connectMongo();
    const { id } = await params;
    if (Types.ObjectId.isValid(id)) {
      await ArtworkModel.findByIdAndUpdate(id, {
        "shopify.lastPushError": err?.message || "Failed to push",
      }).lean();
    }
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
