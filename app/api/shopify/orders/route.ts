import { NextResponse } from "next/server";
import { fetchShopifyOrders } from "@/lib/shopifyOrders";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit") || 25);
    const after = searchParams.get("after");
    const since = searchParams.get("since");

    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 25;

    const result = await fetchShopifyOrders({ limit, after, since });

    return NextResponse.json(
      {
        orders: result.orders,
        pageInfo: result.pageInfo,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Shopify orders";
    console.error("Failed to fetch Shopify orders", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
