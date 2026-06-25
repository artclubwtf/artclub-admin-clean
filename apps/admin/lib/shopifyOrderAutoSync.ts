import { ShopifyOrderCacheModel } from "../models/ShopifyOrderCache";
import { SyncStateModel } from "../models/SyncState";
import { connectMongo } from "./mongodb";
import { backfillShopifyOrders } from "./shopifyOrderBackfill";
import { resolveShopDomain } from "./shopDomain";
import { createSyncRunId, logShopifyPull, logSyncError } from "./sync/syncLogger";

type EnsureFreshShopifyOrderCacheParams = {
  reason: string;
  maxAgeMs?: number;
  overlapMinutes?: number;
};

type EnsureFreshShopifyOrderCacheResult = {
  ok: true;
  skipped: boolean;
  reason: string;
  cachedOrdersCount: number;
  lastSuccessAt: string | null;
};

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_OVERLAP_MINUTES = 15;

let activeSyncPromise: Promise<EnsureFreshShopifyOrderCacheResult> | null = null;

function isoWithOverlap(date: Date | null, overlapMinutes: number) {
  if (!date) return null;
  return new Date(date.getTime() - overlapMinutes * 60 * 1000).toISOString();
}

async function loadOrderSyncState(shopDomain: string) {
  const [state, cachedOrdersCount] = await Promise.all([
    SyncStateModel.findOne({ shopDomain, scope: "shopify_orders_sync" })
      .select({ lastRunAt: 1, lastSuccessAt: 1, lastError: 1 })
      .lean(),
    ShopifyOrderCacheModel.countDocuments({ shopDomain }),
  ]);

  return { state, cachedOrdersCount };
}

export async function ensureFreshShopifyOrderCache(
  params: EnsureFreshShopifyOrderCacheParams,
): Promise<EnsureFreshShopifyOrderCacheResult> {
  await connectMongo();

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    throw new Error("missing_shopify_shop_domain");
  }

  const maxAgeMs = Math.max(60_000, Math.floor(params.maxAgeMs || DEFAULT_MAX_AGE_MS));
  const overlapMinutes = Math.min(Math.max(1, Math.floor(params.overlapMinutes || DEFAULT_OVERLAP_MINUTES)), 1440);
  const now = Date.now();
  const { state, cachedOrdersCount } = await loadOrderSyncState(shopDomain);
  const lastSuccessAt = state?.lastSuccessAt ? new Date(state.lastSuccessAt) : null;
  const isStale = !lastSuccessAt || now - lastSuccessAt.getTime() > maxAgeMs;
  const shouldSync = cachedOrdersCount === 0 || isStale;

  if (!shouldSync) {
    return {
      ok: true,
      skipped: true,
      reason: params.reason,
      cachedOrdersCount,
      lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
    };
  }

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  const runId = createSyncRunId("shopify-orders-auto-sync");
  activeSyncPromise = (async () => {
    const since = isoWithOverlap(lastSuccessAt, overlapMinutes);

    logShopifyPull(
      "shopify_orders_auto_sync_started",
      {
        reason: params.reason,
        shopDomain,
        cachedOrdersCount,
        lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
        since,
      },
      { runId, force: true },
    );

    try {
      const result = await backfillShopifyOrders({ since, runId });
      const completedAt = new Date();

      await SyncStateModel.findOneAndUpdate(
        { shopDomain, scope: "shopify_orders_sync" },
        {
          $set: {
            lastRunAt: completedAt,
            lastSuccessAt: completedAt,
            lastError: null,
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );

      const refreshedCount = await ShopifyOrderCacheModel.countDocuments({ shopDomain });

      logShopifyPull(
        "shopify_orders_auto_sync_finished",
        {
          reason: params.reason,
          shopDomain,
          cached: result.importedOrdersCount > 0,
          processedOrdersCount: result.processedOrdersCount,
          importedOrdersCount: result.importedOrdersCount,
          matchedLineItems: result.matchedLineItemsCount,
          unmatchedLineItems: result.unmatchedLineItemsCount,
          cachedOrdersCount: refreshedCount,
        },
        { runId, force: true },
      );

      return {
        ok: true,
        skipped: false,
        reason: params.reason,
        cachedOrdersCount: refreshedCount,
        lastSuccessAt: completedAt.toISOString(),
      };
    } catch (error) {
      await SyncStateModel.findOneAndUpdate(
        { shopDomain, scope: "shopify_orders_sync" },
        {
          $set: {
            lastRunAt: new Date(),
            lastError: error instanceof Error ? error.message : "shopify_orders_auto_sync_failed",
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );

      logSyncError(
        "shopify_orders_auto_sync_failed",
        error,
        { reason: params.reason, shopDomain, since },
        { runId, force: true },
      );

      throw error;
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
