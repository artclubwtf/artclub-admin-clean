import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { mapCacheToArtworkCard } from "@/lib/mobileCards";
import { ArtworkSignalsModel } from "@/models/ArtworkSignals";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";
import type { ArtworkCard } from "@artclub/models";

const defaultReactions = {
  "🖤": 0,
  "🔥": 0,
  "👀": 0,
  "😵‍💫": 0,
};

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await connectMongo();

    const artwork = await ShopifyArtworkCacheModel.findOne({
      $or: [{ productGid: id }, { handle: id }],
    }).lean();

    if (!artwork) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    const signals = await ArtworkSignalsModel.findOne({ productGid: artwork.productGid }).lean();
    const normalizedSignals = {
      savesCount: signals?.savesCount ?? 0,
      reactions: { ...defaultReactions, ...(signals?.reactions || {}) },
      viewsCount: signals?.viewsCount ?? 0,
    };

    const card = mapCacheToArtworkCard(
      {
        productGid: artwork.productGid,
        title: artwork.title,
        handle: artwork.handle,
        artistMetaobjectGid: artwork.artistMetaobjectGid,
        artistName: artwork.artistName,
        tags: artwork.tags,
        images: artwork.images,
        widthCm: artwork.widthCm,
        heightCm: artwork.heightCm,
        priceEur: artwork.priceEur ?? null,
        isOriginalTagged: artwork.isOriginalTagged,
        shortDescription: artwork.shortDescription,
        lastImportedAt: artwork.lastImportedAt,
        updatedAtShopify: artwork.updatedAtShopify,
        createdAt: artwork.createdAt,
      },
      {
        signals: { savesCount: normalizedSignals.savesCount, reactions: normalizedSignals.reactions },
        createdAt: artwork.updatedAtShopify || artwork.lastImportedAt || artwork.createdAt,
      },
    );

    if (!card) {
      return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
    }

    const response: { artwork: ArtworkCard; signals?: typeof normalizedSignals } = {
      artwork: card,
      signals: normalizedSignals,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("Failed to load mobile artwork detail", err);
    const message = err instanceof Error ? err.message : "Failed to load artwork";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
