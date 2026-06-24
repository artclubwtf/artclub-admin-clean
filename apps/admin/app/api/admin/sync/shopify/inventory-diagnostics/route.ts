import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { fetchShopifyProductInventoryState, getArtistStorageLocation } from "@/lib/sync/shopifyInventory";
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

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const productKey = (url.searchParams.get("productKey") || "").trim();
  if (!productKey) {
    return NextResponse.json({ ok: false, error: "missing_product_key" }, { status: 400 });
  }
  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
  }

  await connectMongo();

  const product = await CanonicalProductModel.findOne({ shopDomain, productKey })
    .select({ _id: 1, productKey: 1, title: 1, status: 1, shopifyProductId: 1, shopify: 1, sync: 1 })
    .lean();
  if (!product?._id) {
    return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
  }

  const productGid = product.shopify?.productGid || product.shopifyProductId;
  if (!productGid) {
    return NextResponse.json({ ok: false, error: "shopify_product_missing" }, { status: 400 });
  }

  const runId = createSyncRunId("inventory-diagnostics");
  const [location, variants, shopifyVariants] = await Promise.all([
    getArtistStorageLocation(runId),
    CanonicalVariantModel.find({ shopDomain, productKey })
      .sort({ createdAt: 1, updatedAt: 1 })
      .select({ _id: 1, variantKey: 1, sku: 1, finish: 1, sizeCode: 1, inventory: 1, shopify: 1, shopifyVariantId: 1 })
      .lean(),
    fetchShopifyProductInventoryState(productGid),
  ]);

  const shopifyVariantByGid = new Map(shopifyVariants.filter((variant) => variant?.id).map((variant) => [variant.id || "", variant] as const));

  return NextResponse.json(
    {
      ok: true,
      product: {
        id: String(product._id),
        productKey: product.productKey,
        title: product.title,
        status: product.status,
        shopifyProductGid: productGid,
        syncStatus: product.sync?.status || null,
        inventoryStatus: product.sync?.inventoryStatus || null,
        inventorySeedStatus: product.sync?.inventorySeedStatus || null,
      },
      variants: variants.map((variant) => {
        const variantGid = variant.shopify?.variantGid || variant.shopifyVariantId || "";
        const shopifyVariant = shopifyVariantByGid.get(variantGid);
        const inventoryItemId = variant.shopify?.inventoryItemGid || shopifyVariant?.inventoryItem?.id || null;
        const currentShopifyQuantity = currentQuantityAtLocation(shopifyVariant?.inventoryItem, location.id);
        return {
          id: String(variant._id),
          variantKey: variant.variantKey,
          sku: variant.sku,
          finish: variant.finish,
          sizeCode: variant.sizeCode,
          inventoryItemId,
          currentShopifyQuantity,
          inventorySeededAt: variant.inventory?.inventorySeededAt
            ? new Date(variant.inventory.inventorySeededAt).toISOString()
            : null,
          initialQuantity: typeof variant.inventory?.initialQuantity === "number" ? variant.inventory.initialQuantity : null,
          editionLimit: typeof variant.inventory?.editionLimit === "number" ? variant.inventory.editionLimit : null,
          recommendedAction: variant.inventory?.inventorySeededAt
            ? "leave_as_is"
            : currentShopifyQuantity > 0
              ? "preserve_existing_quantity"
              : "seed_initial_quantity",
        };
      }),
    },
    { status: 200 },
  );
}
