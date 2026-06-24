import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import {
  fetchShopifyProductInventoryState,
  getArtistStorageLocation,
  getShopifyOriginalInventoryQuantity,
  getShopifyPrintInventoryQuantity,
  seedProductInventoryIfNeeded,
} from "@/lib/sync/shopifyInventory";
import { createSyncRunId } from "@/lib/sync/syncLogger";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

function currentQuantityAtLocation(
  inventoryItem:
    | {
        inventoryLevels?: {
          nodes?: Array<{
            location?: { id?: string | null } | null;
            quantities?: Array<{ name?: string | null; quantity?: number | null }> | null;
          }> | null;
        } | null;
      }
    | null
    | undefined,
  locationId: string,
) {
  const level = inventoryItem?.inventoryLevels?.nodes?.find((node) => node?.location?.id === locationId);
  const quantity = level?.quantities?.find((entry) => (entry?.name || "").trim().toLowerCase() === "available")?.quantity;
  return typeof quantity === "number" && Number.isFinite(quantity) ? quantity : 0;
}

function hasInventoryLevelAtLocation(
  inventoryItem:
    | {
        inventoryLevels?: {
          nodes?: Array<{
            location?: { id?: string | null } | null;
          }> | null;
        } | null;
      }
    | null
    | undefined,
  locationId: string,
) {
  return Boolean(inventoryItem?.inventoryLevels?.nodes?.some((node) => node?.location?.id === locationId));
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { dryRun?: boolean; limit?: number } | null;
  const dryRun = body?.dryRun !== false;
  const limit = Math.min(Math.max(Math.floor(body?.limit || 10), 1), 50);

  await connectMongo();

  const products = await CanonicalProductModel.find({
    shopDomain,
    $or: [{ shopifyProductId: { $exists: true, $ne: null } }, { "shopify.productGid": { $exists: true, $ne: null } }],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .select({ _id: 1, productKey: 1, title: 1, allowPrints: 1, originalAvailable: 1, forSale: 1, shopifyProductId: 1, shopify: 1 })
    .lean();

  const runId = createSyncRunId("inventory-backfill");
  const location = await getArtistStorageLocation(runId);
  const items: Array<Record<string, unknown>> = [];

  for (const product of products) {
    try {
      if (!dryRun) {
        const result = await seedProductInventoryIfNeeded({
          shopDomain,
          productKey: product.productKey,
          runId,
        });
        items.push({
          productKey: product.productKey,
          title: product.title,
          ok: true,
          variants: result.variantActions,
        });
        continue;
      }

      const [variants, shopifyVariants] = await Promise.all([
        CanonicalVariantModel.find({ shopDomain, productKey: product.productKey })
          .sort({ createdAt: 1, updatedAt: 1 })
          .select({ _id: 1, variantKey: 1, sku: 1, finish: 1, inventory: 1, shopify: 1, shopifyVariantId: 1 })
          .lean(),
        fetchShopifyProductInventoryState(product.shopify?.productGid || product.shopifyProductId || ""),
      ]);
      const shopifyVariantByGid = new Map(shopifyVariants.filter((variant) => variant?.id).map((variant) => [variant.id || "", variant] as const));

      items.push({
        productKey: product.productKey,
        title: product.title,
        ok: true,
        variants: variants.map((variant) => {
          const variantGid = variant.shopify?.variantGid || variant.shopifyVariantId || "";
          const shopifyVariant = shopifyVariantByGid.get(variantGid);
          const inventoryItemId = variant.shopify?.inventoryItemGid || shopifyVariant?.inventoryItem?.id || null;
          const currentQuantity = currentQuantityAtLocation(shopifyVariant?.inventoryItem, location.id);
          const hasLevel = hasInventoryLevelAtLocation(shopifyVariant?.inventoryItem, location.id);
          const seedQuantity = (variant.finish || "").trim().toLowerCase() === "original"
            ? getShopifyOriginalInventoryQuantity()
            : getShopifyPrintInventoryQuantity();
          return {
            productKey: product.productKey,
            title: product.title,
            sku: variant.sku,
            inventoryItemId,
            currentQuantity,
            action: variant.inventory?.inventorySeededAt
              ? "skipped_already_seeded"
              : !hasLevel
                ? "would_activate"
              : currentQuantity > 0
                ? "preserved_existing_quantity"
                : "would_seed",
            seedQuantity,
            error: null,
          };
        }),
      });
    } catch (error) {
      items.push({
        productKey: product.productKey,
        title: product.title,
        ok: false,
        variants: [
          {
            productKey: product.productKey,
            title: product.title,
            sku: null,
            inventoryItemId: null,
            currentQuantity: null,
            action: "error",
            error: error instanceof Error ? error.message : "inventory_backfill_failed",
          },
        ],
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      dryRun,
      count: items.length,
      items,
    },
    { status: 200 },
  );
}
