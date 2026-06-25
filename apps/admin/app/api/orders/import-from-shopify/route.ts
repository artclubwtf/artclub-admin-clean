import { NextResponse } from "next/server";
import { backfillShopifyOrders } from "@/lib/shopifyOrderBackfill";
import { connectMongo } from "@/lib/mongodb";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const queryLimit = searchParams.get("limit");
    const querySince = searchParams.get("since");

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const limitParam = Number(body.limit ?? queryLimit ?? 25);
    const since = (body.since ?? querySince ?? "").trim() || null;
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 25;

    await connectMongo();
    const result = await backfillShopifyOrders({
      limitPerPage: limit,
      maxPages: 1,
      since,
    });

    return NextResponse.json(
      {
        importedCount: result.importedOrdersCount,
        skippedCount: result.skippedOrdersCount,
        matchedLineItemsCount: result.matchedLineItemsCount,
        unmatchedLineItemsCount: result.unmatchedLineItemsCount,
        latestMatched: result.latestMatched,
        latestUnmatched: result.latestUnmatched,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import Shopify orders";
    console.error("Failed to import Shopify orders", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
