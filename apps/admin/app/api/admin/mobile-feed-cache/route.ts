import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

export async function GET() {
  try {
    await connectMongo();

    const [count, latest] = await Promise.all([
      ShopifyArtworkCacheModel.countDocuments({}),
      ShopifyArtworkCacheModel.findOne({ lastImportedAt: { $type: "date" } })
        .sort({ lastImportedAt: -1 })
        .select({ lastImportedAt: 1 })
        .lean(),
    ]);

    const lastImportedAt = latest?.lastImportedAt ? new Date(latest.lastImportedAt).toISOString() : null;

    return NextResponse.json({ count, lastImportedAt }, { status: 200 });
  } catch (err) {
    console.error("Failed to load mobile feed cache stats", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
