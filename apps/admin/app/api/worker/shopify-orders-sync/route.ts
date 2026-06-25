import { NextResponse } from "next/server";

import { backfillShopifyOrders } from "@/lib/shopifyOrderBackfill";
import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { createSyncRunId, logShopifyPull, logSyncError } from "@/lib/sync/syncLogger";
import { hasValidWorkerSecret } from "@/lib/workerAuth";
import { SyncStateModel } from "@/models/SyncState";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function isoWithOverlap(date: Date | null, overlapMinutes: number) {
  if (!date) return null;
  return new Date(date.getTime() - overlapMinutes * 60 * 1000).toISOString();
}

export async function POST(req: Request) {
  const runId = createSyncRunId("shopify-orders-sync");
  logShopifyPull(
    "route_hit",
    {
      path: new URL(req.url).pathname,
      shopifyOrderId: null,
      orderName: null,
      fetchedFromShopify: false,
      cached: false,
      matchedLineItems: 0,
      unmatchedLineItems: 0,
    },
    { runId, force: true },
  );

  if (!hasValidWorkerSecret(req)) {
    logShopifyPull(
      "shopify_orders_worker_sync_unauthorized",
      {
        shopifyOrderId: null,
        orderName: null,
        fetchedFromShopify: false,
        cached: false,
        matchedLineItems: 0,
        unmatchedLineItems: 0,
      },
      { runId, force: true },
    );
    return unauthorized();
  }

  const body = (await req.json().catch(() => null)) as { limitPerPage?: number; maxPages?: number; overlapMinutes?: number } | null;
  const shopDomain = resolveShopDomain();

  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shopify_shop_domain", runId }, { status: 500 });
  }

  await connectMongo();

  const existing = await SyncStateModel.findOne({ shopDomain, scope: "shopify_orders_sync" })
    .select({ lastSuccessAt: 1 })
    .lean();

  const overlapMinutes = Math.min(Math.max(1, Math.floor(body?.overlapMinutes || 15)), 1440);
  const since = isoWithOverlap(existing?.lastSuccessAt || null, overlapMinutes);

  try {
    const result = await backfillShopifyOrders({
      limitPerPage: body?.limitPerPage,
      maxPages: body?.maxPages,
      since,
      runId,
    });

    logShopifyPull(
      "shopify_orders_worker_sync_completed",
      {
        shopifyOrderId: null,
        orderName: null,
        fetchedFromShopify: result.processedOrdersCount > 0,
        cached: result.importedOrdersCount > 0,
        matchedLineItems: result.matchedLineItemsCount,
        unmatchedLineItems: result.unmatchedLineItemsCount,
        processedOrdersCount: result.processedOrdersCount,
        importedOrdersCount: result.importedOrdersCount,
        skippedOrdersCount: result.skippedOrdersCount,
        since,
      },
      { runId, force: true },
    );

    await SyncStateModel.findOneAndUpdate(
      { shopDomain, scope: "shopify_orders_sync" },
      {
        $set: {
          lastRunAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ since, runId, ...result }, { status: 200 });
  } catch (error) {
    logShopifyPull(
      "shopify_orders_worker_sync_failed",
      {
        shopifyOrderId: null,
        orderName: null,
        fetchedFromShopify: false,
        cached: false,
        matchedLineItems: 0,
        unmatchedLineItems: 0,
        since,
      },
      { runId, force: true },
    );
    await SyncStateModel.findOneAndUpdate(
      { shopDomain, scope: "shopify_orders_sync" },
      {
        $set: {
          lastRunAt: new Date(),
          lastError: error instanceof Error ? error.message : "shopify_orders_sync_failed",
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    logSyncError("shopify_orders_worker_sync_failed", error, { shopDomain, since }, { runId, force: true });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "shopify_orders_sync_failed", runId },
      { status: 500 },
    );
  }
}
