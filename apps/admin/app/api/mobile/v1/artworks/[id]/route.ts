import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ArtworkSignalsModel } from "@/models/ArtworkSignals";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

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

    return NextResponse.json({ artwork, signals: normalizedSignals }, { status: 200 });
  } catch (err) {
    console.error("Failed to load mobile artwork detail", err);
    const message = err instanceof Error ? err.message : "Failed to load artwork";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
