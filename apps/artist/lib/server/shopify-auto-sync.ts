import { syncProductInventoryToShopify } from "../../../admin/lib/sync/shopifyInventory";
import { pushOneArtist, pushOneProduct } from "../../../admin/lib/sync/shopifyPush";
import {
  isShopifySyncInlineEnabled,
  queueArtistPushJob,
  queueProductPushJob,
} from "../../../admin/lib/sync/shopifySyncJobs";
import {
  createSyncRunId,
  logAutoSync,
  logShopifyPush,
  logSyncError,
} from "../../../admin/lib/sync/syncLogger";
import { isShopifyWriteEnabled } from "../../../admin/lib/featureFlags";
import { CanonicalArtistModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";

export type AutoShopifySyncResult =
  | {
      ok: true;
      skipped?: boolean;
      queued?: boolean;
      status?: string | null;
      jobId?: string | null;
      message?: string;
      runId?: string;
      shopifyProductId?: string | null;
      productGid?: string | null;
      variantCount?: number;
      syncStatus?: string | null;
      lastPushAt?: string | null;
    }
  | { ok: false; error: string; runId?: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "shopify_sync_failed";
}

function resultFromPushItem(
  result: Awaited<ReturnType<typeof pushOneProduct>> | Awaited<ReturnType<typeof pushOneArtist>>,
  key: string,
): AutoShopifySyncResult {
  const item = result.items.find((entry) => entry.key === key) || result.items[0];
  if (item?.status === "created" || item?.status === "updated") {
    return { ok: true, message: item.message };
  }
  if (item?.status === "skipped" || item?.status === "dry_run") {
    return { ok: false, error: item.message };
  }
  return { ok: false, error: item?.message || result.errors[0] || "shopify_sync_failed" };
}

export async function autoPushProductToShopify(input: {
  shopDomain: string;
  productKey: string;
  shouldPush: boolean;
  runId?: string;
  reason?: string;
}): Promise<AutoShopifySyncResult> {
  const runId = input.runId || createSyncRunId("artist-auto-sync");
  if (!input.shouldPush) return { ok: true, skipped: true, message: "not_saleable", runId };

  const product = await CanonicalProductModel.findOne({
    shopDomain: input.shopDomain,
    productKey: input.productKey,
  })
    .select({ _id: 1, productKey: 1, canonicalArtistId: 1, shopifyProductId: 1, shopify: 1, sync: 1 })
    .lean()
    .catch(() => null);

  if (!isShopifyWriteEnabled()) {
    logShopifyPush(
      "shopify_write_disabled_diagnostics",
      {
        service: "artist",
        SHOPIFY_WRITE_ENABLED: (process.env.SHOPIFY_WRITE_ENABLED || "").trim() || null,
        hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        hasShopifyShopDomain: Boolean(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN),
        attemptedOperation: "push_product",
        canonicalProductId: product?._id ? String(product._id) : null,
        productKey: input.productKey,
        requiredFix: "Set SHOPIFY_WRITE_ENABLED=true on this service",
      },
      { runId, force: true },
    );
    return { ok: false, error: "shopify_write_disabled", runId };
  }

  try {
    if (!isShopifySyncInlineEnabled()) {
      if (!product?._id) {
        return { ok: false, error: "canonical_product_not_found", runId };
      }

      const job = await queueProductPushJob({
        canonicalProductId: String(product._id),
        canonicalArtistId: product.canonicalArtistId ? String(product.canonicalArtistId) : null,
        shopDomain: input.shopDomain,
        productKey: input.productKey,
        reason: input.reason || "auto_sync",
        runId,
      });

      logAutoSync(
        "artist_app_auto_shopify_push_queued",
        {
          canonicalProductId: String(product._id),
          productKey: input.productKey,
          jobId: String(job._id),
          reason: input.reason || "auto_sync",
          syncStatus: "queued",
        },
        { runId, force: true },
      );

      return {
        ok: true,
        queued: true,
        status: "queued",
        jobId: String(job._id),
        runId,
      };
    }

    logAutoSync(
      "artist_app_auto_shopify_push_started",
      {
        canonicalProductId: null,
        productKey: input.productKey,
        reason: input.reason || "auto_sync",
      },
      { runId },
    );

    const result = await pushOneProduct({
      shopDomain: input.shopDomain,
      productKey: input.productKey,
      runId,
      origin: "artist_inline",
      service: "artist",
    });
    const sync = resultFromPushItem(result, input.productKey);
    if (!sync.ok) {
      await CanonicalProductModel.updateOne(
        { shopDomain: input.shopDomain, productKey: input.productKey },
        {
          $set: {
            "sync.needsPush": true,
            "sync.lastError": sync.error,
            "sync.status": "error",
          },
        },
      ).catch(() => null);
      logSyncError(
        "artist_app_auto_shopify_push_failed",
        sync.error,
        {
          shopDomain: input.shopDomain,
          productKey: input.productKey,
        },
        { runId, force: true },
      );
      return { ...sync, runId };
    }

    await syncProductInventoryToShopify({
      shopDomain: input.shopDomain,
      productKey: input.productKey,
      runId,
      markProductSynced: true,
    });

    const productAfterPush = await CanonicalProductModel.findOne({
      shopDomain: input.shopDomain,
      productKey: input.productKey,
    })
      .select({ _id: 1, shopifyProductId: 1, shopify: 1, sync: 1 })
      .lean();
    const variantCount = await CanonicalVariantModel.countDocuments({
      shopDomain: input.shopDomain,
      productKey: input.productKey,
    }).catch(() => 0);

    logAutoSync(
      "artist_app_auto_shopify_push_succeeded",
      {
        canonicalProductId: productAfterPush?._id ? String(productAfterPush._id) : null,
        shopifyProductId: productAfterPush?.shopifyProductId || null,
        productGid: productAfterPush?.shopify?.productGid || productAfterPush?.shopifyProductId || null,
        variantCount,
        syncStatus: productAfterPush?.sync?.status || null,
        lastPushAt: productAfterPush?.sync?.lastPushAt ? new Date(productAfterPush.sync.lastPushAt).toISOString() : null,
      },
      { runId },
    );

    return {
      ...sync,
      runId,
      status: "synced",
      shopifyProductId: productAfterPush?.shopifyProductId || null,
      productGid: productAfterPush?.shopify?.productGid || productAfterPush?.shopifyProductId || null,
      variantCount,
      syncStatus: productAfterPush?.sync?.status || null,
      lastPushAt: productAfterPush?.sync?.lastPushAt ? new Date(productAfterPush.sync.lastPushAt).toISOString() : null,
    };
  } catch (error) {
    const message = errorMessage(error);
    await CanonicalProductModel.updateOne(
      { shopDomain: input.shopDomain, productKey: input.productKey },
      {
        $set: {
          "sync.needsPush": true,
          "sync.lastError": message,
          "sync.status": "error",
        },
      },
    ).catch(() => null);
    logSyncError(
      "artist_app_auto_shopify_push_failed",
      error,
      {
        shopDomain: input.shopDomain,
        productKey: input.productKey,
      },
      { runId, force: true },
    );
    return { ok: false, error: message, runId };
  }
}

export async function autoPushArtistToShopify(input: {
  shopDomain: string;
  artistKey: string;
  shouldPush: boolean;
  runId?: string;
}): Promise<AutoShopifySyncResult> {
  const runId = input.runId || createSyncRunId("artist-auto-sync");
  if (!input.shouldPush) return { ok: true, skipped: true, message: "no_public_profile_changes", runId };

  const artist = await CanonicalArtistModel.findOne({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
  })
    .select({ _id: 1, artistKey: 1 })
    .lean()
    .catch(() => null);

  if (!isShopifyWriteEnabled()) {
    logShopifyPush(
      "shopify_write_disabled_diagnostics",
      {
        service: "artist",
        SHOPIFY_WRITE_ENABLED: (process.env.SHOPIFY_WRITE_ENABLED || "").trim() || null,
        hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        hasShopifyShopDomain: Boolean(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN),
        attemptedOperation: "push_artist",
        canonicalArtistId: artist?._id ? String(artist._id) : null,
        artistKey: input.artistKey,
        requiredFix: "Set SHOPIFY_WRITE_ENABLED=true on this service",
      },
      { runId, force: true },
    );
    return { ok: false, error: "shopify_write_disabled", runId };
  }

  try {
    if (!isShopifySyncInlineEnabled()) {
      if (!artist?._id) {
        return { ok: false, error: "canonical_artist_not_found", runId };
      }

      const job = await queueArtistPushJob({
        canonicalArtistId: String(artist._id),
        shopDomain: input.shopDomain,
        artistKey: input.artistKey,
        reason: "auto_sync",
        runId,
      });

      logAutoSync(
        "artist_app_auto_shopify_artist_push_queued",
        {
          canonicalArtistId: String(artist._id),
          artistKey: input.artistKey,
          jobId: String(job._id),
        },
        { runId, force: true },
      );

      return {
        ok: true,
        queued: true,
        status: "queued",
        jobId: String(job._id),
        runId,
      };
    }

    const result = await pushOneArtist({ shopDomain: input.shopDomain, artistKey: input.artistKey, runId });
    const sync = resultFromPushItem(result, input.artistKey);
    if (!sync.ok) {
      await CanonicalArtistModel.updateOne(
        { shopDomain: input.shopDomain, artistKey: input.artistKey },
        {
          $set: {
            "sync.needsPush": true,
            "sync.lastError": sync.error,
            "sync.status": "error",
          },
        },
      ).catch(() => null);
      logSyncError(
        "artist_app_auto_shopify_artist_push_failed",
        sync.error,
        {
          shopDomain: input.shopDomain,
          artistKey: input.artistKey,
        },
        { runId, force: true },
      );
      return { ...sync, runId };
    }
    return { ...sync, runId };
  } catch (error) {
    const message = errorMessage(error);
    await CanonicalArtistModel.updateOne(
      { shopDomain: input.shopDomain, artistKey: input.artistKey },
      {
        $set: {
          "sync.needsPush": true,
          "sync.lastError": message,
          "sync.status": "error",
        },
      },
    ).catch(() => null);
    logSyncError(
      "artist_app_auto_shopify_artist_push_failed",
      error,
      {
        shopDomain: input.shopDomain,
        artistKey: input.artistKey,
      },
      { runId, force: true },
    );
    return { ok: false, error: message, runId };
  }
}
