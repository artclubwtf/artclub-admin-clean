import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  buildRunnableJobQuery,
  formatShopifySyncJobForDiagnostics,
  getShopifySyncJobCollectionName,
  getShopifySyncJobDbName,
  getShopifySyncQueueDiagnostics,
} from "@/lib/sync/shopifySyncJobs";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";
import { ShopifySyncJobModel } from "@/models/ShopifySyncJob";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  await connectMongo();

  const diagnostics = await getShopifySyncQueueDiagnostics();
  const nextRunnableJobs = await ShopifySyncJobModel.find(buildRunnableJobQuery())
    .sort({ priority: -1, nextRunAt: 1, createdAt: 1 })
    .limit(10)
    .lean();
  const [latestProducts, productsWithInventorySeedMissing] = await Promise.all([
    CanonicalProductModel.find({
      $or: [
        { status: "shopify_pending" },
        { "sync.status": { $in: ["queued", "inventory_seed_error", "inventory_seed_pending", "partial_error"] } },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(10)
      .select({ _id: 1, productKey: 1, title: 1, status: 1, sync: 1, canonicalArtistId: 1, updatedAt: 1 })
      .lean(),
    CanonicalVariantModel.aggregate([
      {
        $match: {
          "shopify.inventoryItemGid": { $exists: true, $ne: null },
          $or: [{ "inventory.inventorySeededAt": { $exists: false } }, { "inventory.inventorySeededAt": null }],
        },
      },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 1,
          canonicalProductId: 1,
          productKey: 1,
          variantKey: 1,
          sku: 1,
          finish: 1,
          sizeCode: 1,
          inventoryItemId: "$shopify.inventoryItemGid",
        },
      },
    ]),
  ]);

  return NextResponse.json(
    {
      ok: true,
      dbName: getShopifySyncJobDbName(),
      collectionName: getShopifySyncJobCollectionName(),
      counts: diagnostics.counts,
      runnableCount: diagnostics.nextRunnableCount,
      nextRunnableJobs: nextRunnableJobs.map((job) => formatShopifySyncJobForDiagnostics(job as any)),
      latestJobs: diagnostics.latestJobs,
      latestProducts: latestProducts.map((product) => ({
        id: String(product._id),
        productKey: product.productKey,
        title: product.title,
        status: product.status,
        canonicalArtistId: product.canonicalArtistId ? String(product.canonicalArtistId) : null,
        syncStatus: product.sync?.status || null,
        inventoryStatus: product.sync?.inventoryStatus || null,
        inventorySeedStatus: product.sync?.inventorySeedStatus || null,
        needsPush: product.sync?.needsPush === true,
        needsInventorySeed: product.sync?.needsInventorySeed === true,
        lastError: product.sync?.lastError || null,
        updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : null,
      })),
      productsWithInventorySeedMissing: productsWithInventorySeedMissing.map((variant) => ({
        id: String(variant._id),
        canonicalProductId: variant.canonicalProductId ? String(variant.canonicalProductId) : null,
        productKey: variant.productKey || null,
        variantKey: variant.variantKey || null,
        sku: variant.sku || null,
        finish: variant.finish || null,
        sizeCode: variant.sizeCode || null,
        inventoryItemId: variant.inventoryItemId || null,
      })),
    },
    { status: 200 },
  );
}
