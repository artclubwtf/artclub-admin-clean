import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { syncProductInventoryToShopify } from "@/lib/sync/shopifyInventory";
import { createSyncRunId } from "@/lib/sync/syncLogger";
import { CanonicalProductModel } from "@/models/CanonicalProduct";

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { cursor?: string; limit?: number } | null;
  const limit = Math.min(Math.max(Math.floor(body?.limit || 10), 1), 10);

  await connectMongo();

  const query: Record<string, unknown> = {
    shopDomain,
    $and: [
      {
        $or: [{ shopifyProductId: { $exists: true, $ne: null } }, { "shopify.productGid": { $exists: true, $ne: null } }],
      },
      {
        $or: [
          { "sync.inventoryStatus": { $ne: "synced" } },
          { "sync.lastInventorySyncAt": { $exists: false } },
        ],
      },
    ],
  };

  if (body?.cursor && Types.ObjectId.isValid(body.cursor)) {
    query._id = { $gt: new Types.ObjectId(body.cursor) };
  }

  const products = await CanonicalProductModel.find(query)
    .sort({ _id: 1 })
    .limit(limit)
    .select({ _id: 1, productKey: 1, title: 1 })
    .lean();

  const runId = createSyncRunId("inventory-backfill");
  const items: Array<Record<string, unknown>> = [];

  for (const product of products) {
    try {
      const result = await syncProductInventoryToShopify({
        shopDomain,
        productKey: product.productKey,
        runId,
        markProductSynced: false,
      });
      items.push({
        productKey: product.productKey,
        title: product.title,
        ok: true,
        ...result,
      });
    } catch (error) {
      items.push({
        productKey: product.productKey,
        title: product.title,
        ok: false,
        error: error instanceof Error ? error.message : "inventory_backfill_failed",
      });
    }
  }

  const nextCursor = products.length === limit ? String(products[products.length - 1]?._id || "") : null;

  return NextResponse.json(
    {
      ok: true,
      count: items.length,
      nextCursor,
      items,
    },
    { status: 200 },
  );
}
