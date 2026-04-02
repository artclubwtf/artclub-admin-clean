import { buildProductMetafieldsForArtwork, upsertArtistMetaobject } from "@/lib/shopify";
import { getArtistShopifySyncMode } from "@/lib/artistShopifySyncMode";
import { assertShopifyWriteEnabled } from "@/lib/featureFlags";
import { connectMongo } from "@/lib/mongodb";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel, type CanonicalProduct } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

type PushInput = {
  shopDomain: string;
  limit?: number;
  artistKeys?: string[];
  productKeys?: string[];
  dryRun?: boolean;
  approvedOnly?: boolean;
};

type PushItemStatus = "created" | "updated" | "skipped" | "error" | "dry_run";

type PushResult = {
  pushedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
  items: Array<{ key: string; status: PushItemStatus; message: string }>;
};

type ShopifyVariantNode = {
  id?: string | null;
  sku?: string | null;
  inventoryItem?: { id?: string | null } | null;
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizeShopStatus(status: CanonicalProduct["status"]): "DRAFT" | "ACTIVE" | "ARCHIVED" {
  if (status === "active") return "ACTIVE";
  if (status === "archived") return "ARCHIVED";
  return "DRAFT";
}

function normalizePrice(priceCents: number): string {
  return (Math.max(0, Number.isFinite(priceCents) ? priceCents : 0) / 100).toFixed(2);
}

function resolveArtistAppUrl(artist: { appUrl?: string | null; publicSlug?: string | null; handle?: string | null }) {
  const direct = (artist.appUrl || "").trim();
  if (direct) return direct;

  const slug = (artist.publicSlug || artist.handle || "").trim();
  const base =
    (process.env.ARTIST_APP_BASE_URL || process.env.NEXT_PUBLIC_ARTIST_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (base && slug) {
    return `${base.replace(/\/$/, "")}/artist/${encodeURIComponent(slug)}`;
  }

  return "";
}

function canPushSaleableProduct(product: Pick<CanonicalProduct, "forSale" | "allowPrints" | "approvalStatus">) {
  const saleable = product.forSale === true || product.allowPrints === true;
  if (!saleable) {
    return { ok: false, reason: "Product is neither for sale nor prints-enabled" };
  }
  if (product.approvalStatus !== "approved" && product.approvalStatus !== "published") {
    return { ok: false, reason: "Approval required before pushing saleable work" };
  }
  return { ok: true, reason: "" };
}

async function callShopifyAdmin<TData>(query: string, variables: Record<string, unknown>): Promise<TData | undefined> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);

  const json = JSON.parse(text) as { data?: TData; errors?: unknown };
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function createShopifyProduct(product: CanonicalProduct) {
  const mutation = `
    mutation PushProductCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          variants(first: 1) {
            nodes {
              id
              sku
              inventoryItem { id }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const metafields = buildProductMetafieldsForArtwork({
    artistMetaobjectId: product.artistRef || undefined,
    widthCm: product.dimensions?.widthCm,
    heightCm: product.dimensions?.heightCm,
    kurzbeschreibung: product.shortText || undefined,
  });

  const data = await callShopifyAdmin<{
    productCreate?: {
      product?: {
        id?: string;
        variants?: { nodes?: ShopifyVariantNode[] };
      };
      userErrors?: Array<{ message?: string }>;
    };
  }>(mutation, {
    input: {
      title: product.title,
      descriptionHtml: product.description || undefined,
      tags: product.tags || [],
      status: normalizeShopStatus(product.status),
      metafields,
    },
  });

  const payload = data?.productCreate;
  if (!payload) throw new Error("Shopify productCreate returned no payload");
  if (payload.userErrors?.length) {
    const message = payload.userErrors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || "Shopify productCreate failed");
  }

  const productId = payload.product?.id;
  if (!productId) throw new Error("Shopify productCreate returned no product id");
  const defaultVariant = payload.product?.variants?.nodes?.[0];
  return {
    productId,
    defaultVariantId: defaultVariant?.id || null,
    defaultInventoryItemId: defaultVariant?.inventoryItem?.id || null,
  };
}

async function updateShopifyProduct(productGid: string, product: CanonicalProduct) {
  const mutation = `
    mutation PushProductUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin<{
    productUpdate?: {
      product?: { id?: string };
      userErrors?: Array<{ message?: string }>;
    };
  }>(mutation, {
    input: {
      id: productGid,
      title: product.title,
      descriptionHtml: product.description || undefined,
      tags: product.tags || [],
      status: normalizeShopStatus(product.status),
    },
  });

  const payload = data?.productUpdate;
  if (!payload) throw new Error("Shopify productUpdate returned no payload");
  if (payload.userErrors?.length) {
    const message = payload.userErrors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || "Shopify productUpdate failed");
  }
}

async function setProductMetafields(productGid: string, product: CanonicalProduct) {
  const mutation = `
    mutation PushProductMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message code }
      }
    }
  `;

  const metafields = buildProductMetafieldsForArtwork({
    artistMetaobjectId: product.artistRef || undefined,
    widthCm: product.dimensions?.widthCm,
    heightCm: product.dimensions?.heightCm,
    kurzbeschreibung: product.shortText || undefined,
  }).map((metafield) => ({
    ownerId: productGid,
    namespace: metafield.namespace,
    key: metafield.key,
    type: metafield.type,
    value: metafield.value,
  }));

  if (!metafields.length) return;

  const data = await callShopifyAdmin<{
    metafieldsSet?: {
      userErrors?: Array<{ message?: string }>;
    };
  }>(mutation, { metafields });

  const payload = data?.metafieldsSet;
  if (!payload) throw new Error("Shopify metafieldsSet returned no payload");
  if (payload.userErrors?.length) {
    const message = payload.userErrors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || "Shopify metafieldsSet failed");
  }
}

async function fetchShopifyProductVariants(productGid: string): Promise<ShopifyVariantNode[]> {
  const query = `
    query PushProductVariants($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          nodes {
            id
            sku
            inventoryItem { id }
          }
        }
      }
    }
  `;

  const data = await callShopifyAdmin<{
    product?: {
      variants?: {
        nodes?: ShopifyVariantNode[];
      };
    };
  }>(query, { id: productGid });

  return data?.product?.variants?.nodes || [];
}

async function bulkUpdateShopifyVariants(
  productGid: string,
  variants: Array<{ variantGid: string; sku: string; priceCents: number }>,
) {
  if (!variants.length) return;

  const mutation = `
    mutation PushVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin<{
    productVariantsBulkUpdate?: {
      userErrors?: Array<{ message?: string }>;
    };
  }>(mutation, {
    productId: productGid,
    variants: variants.map((variant) => ({
      id: variant.variantGid,
      sku: variant.sku,
      price: normalizePrice(variant.priceCents),
    })),
  });

  const payload = data?.productVariantsBulkUpdate;
  if (!payload) throw new Error("Shopify productVariantsBulkUpdate returned no payload");
  if (payload.userErrors?.length) {
    const message = payload.userErrors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || "Shopify productVariantsBulkUpdate failed");
  }
}

export async function pushArtists(input: PushInput): Promise<PushResult> {
  assertShopifyWriteEnabled();
  await connectMongo();
  const syncMode = getArtistShopifySyncMode();

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 250);
  const artists = await CanonicalArtistModel.find({
    shopDomain: input.shopDomain,
    ...(input.artistKeys?.length ? { artistKey: { $in: input.artistKeys } } : { "sync.needsPush": true }),
  })
    .sort({ "sync.dirtyAt": 1, updatedAt: 1 })
    .limit(limit)
    .lean();

  console.info(`[shopifyPush][artists] mode=${syncMode} count=${artists.length}`);

  let pushedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const items: Array<{ key: string; status: PushItemStatus; message: string }> = [];

  for (const artist of artists) {
    try {
      const appUrl = resolveArtistAppUrl(artist);
      if (!artist.displayName?.trim()) {
        skippedCount += 1;
        items.push({ key: artist.artistKey, status: "skipped", message: "Missing artist name" });
        continue;
      }
      if (!appUrl) {
        skippedCount += 1;
        items.push({ key: artist.artistKey, status: "skipped", message: "Missing app_url for Shopify metaobject" });
        continue;
      }

      const fields =
        syncMode === "legacy"
          ? {
              app_url: appUrl,
              name: artist.displayName,
              instagram: artist.instagram || undefined,
              bilder: artist.profileImages?.heroUrl || undefined,
              bild_1: artist.profileImages?.avatarUrl || undefined,
            }
          : {
              // Minimal mode intentionally syncs only identifiers.
              app_url: appUrl,
              name: artist.displayName,
            };

      const willUpdate = Boolean(artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid);
      if (input.dryRun) {
        skippedCount += 1;
        items.push({
          key: artist.artistKey,
          status: "dry_run",
          message: willUpdate ? "Would update Shopify artist metaobject" : "Would create Shopify artist metaobject",
        });
        continue;
      }

      const result = await upsertArtistMetaobject({
        metaobjectId:
          artist.shopifyMetaobjectId || (syncMode === "legacy" ? artist.shopify?.metaobjectGid || undefined : undefined),
        handle: artist.handle,
        fields,
      });

      await CanonicalArtistModel.updateOne(
        { shopDomain: input.shopDomain, artistKey: artist.artistKey },
        {
          $set: {
            shopifyMetaobjectId: result.id,
            publicSlug: artist.publicSlug || artist.handle,
            migrationStatus: "linked",
            linkStatus: "linked",
            "shopify.metaobjectGid": result.id,
            "shopify.lastPushedAt": new Date(),
            "sync.lastPushAt": new Date(),
            "sync.lastError": null,
            "sync.needsPush": false,
            "sync.dirtyAt": null,
            "sync.dirtyFields": [],
          },
        },
      );

      pushedCount += 1;
      items.push({
        key: artist.artistKey,
        status: willUpdate ? "updated" : "created",
        message: willUpdate ? "Updated Shopify artist metaobject" : "Created Shopify artist metaobject",
      });
    } catch (error) {
      await CanonicalArtistModel.updateOne(
        { shopDomain: input.shopDomain, artistKey: artist.artistKey },
        {
          $set: {
            "sync.lastError": error instanceof Error ? error.message : "push_failed",
          },
        },
      );
      failedCount += 1;
      const message = `${artist.artistKey} [mode=${syncMode}]: ${error instanceof Error ? error.message : "push_failed"}`;
      errors.push(message);
      items.push({ key: artist.artistKey, status: "error", message });
    }
  }

  return { pushedCount, failedCount, skippedCount, errors, items };
}

export async function pushProducts(input: PushInput): Promise<PushResult> {
  assertShopifyWriteEnabled();
  await connectMongo();

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 250);
  const products = await CanonicalProductModel.find({
    shopDomain: input.shopDomain,
    ...(input.productKeys?.length ? { productKey: { $in: input.productKeys } } : { "sync.needsPush": true }),
    ...(input.approvedOnly ? { approvalStatus: { $in: ["approved", "published"] } } : {}),
  })
    .sort({ "sync.dirtyAt": 1, updatedAt: 1 })
    .limit(limit)
    .lean();

  let pushedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const items: Array<{ key: string; status: PushItemStatus; message: string }> = [];

  for (const product of products) {
    try {
      const saleableCheck = canPushSaleableProduct(product);
      if (!saleableCheck.ok) {
        skippedCount += 1;
        items.push({ key: product.productKey, status: "skipped", message: saleableCheck.reason });
        continue;
      }

      if (product.status === "db_only") {
        if (input.dryRun) {
          skippedCount += 1;
          items.push({ key: product.productKey, status: "dry_run", message: "Would mark db_only product as synced without Shopify write" });
          continue;
        }
        await CanonicalProductModel.updateOne(
          { shopDomain: input.shopDomain, productKey: product.productKey },
          {
            $set: {
              "shopify.lastPushedAt": new Date(),
              "sync.lastPushAt": new Date(),
              "sync.lastError": null,
              "sync.needsPush": false,
              "sync.dirtyAt": null,
              "sync.dirtyFields": [],
            },
          },
        );
        pushedCount += 1;
        items.push({ key: product.productKey, status: "updated", message: "Marked db_only product as synced" });
        continue;
      }

      let productGid = product.shopifyProductId || product.shopify?.productGid || "";
      let defaultVariantId: string | null = null;
      let defaultInventoryItemId: string | null = null;
      const willUpdate = Boolean(productGid);

      if (input.dryRun) {
        skippedCount += 1;
        items.push({
          key: product.productKey,
          status: "dry_run",
          message: willUpdate ? "Would update Shopify product and variants" : "Would create Shopify product and variants",
        });
        continue;
      }

      if (productGid) {
        await updateShopifyProduct(productGid, product);
      } else {
        const created = await createShopifyProduct(product);
        productGid = created.productId;
        defaultVariantId = created.defaultVariantId;
        defaultInventoryItemId = created.defaultInventoryItemId;
      }

      await setProductMetafields(productGid, product);

      const canonicalVariants = await CanonicalVariantModel.find({
        shopDomain: input.shopDomain,
        productKey: product.productKey,
      })
        .sort({ updatedAt: 1, createdAt: 1 })
        .lean();

      const shopifyVariants = await fetchShopifyProductVariants(productGid);
      const variantBySku = new Map(
        shopifyVariants
          .filter((variant) => typeof variant.sku === "string" && variant.sku.trim())
          .map((variant) => [variant.sku!.trim(), variant]),
      );

      const updates: Array<{ variantGid: string; sku: string; priceCents: number }> = [];
      const matchedVariantKeys = new Set<string>();
      for (const [index, variant] of canonicalVariants.entries()) {
        const matchedBySku = variant.sku ? variantBySku.get(variant.sku) : undefined;
        const fallbackDefault = !variant.shopify?.variantGid && !variant.shopifyVariantId && !matchedBySku && index === 0 ? defaultVariantId : null;
        const variantGid = variant.shopifyVariantId || variant.shopify?.variantGid || matchedBySku?.id || fallbackDefault || null;
        if (!variantGid) continue;
        matchedVariantKeys.add(variant.variantKey);

        updates.push({
          variantGid,
          sku: variant.sku,
          priceCents: variant.priceCents,
        });

        const inventoryItemGid = variant.shopify?.inventoryItemGid || matchedBySku?.inventoryItem?.id || defaultInventoryItemId || undefined;
        await CanonicalVariantModel.updateOne(
          { shopDomain: input.shopDomain, productKey: product.productKey, variantKey: variant.variantKey },
          {
            $set: {
              shopifyVariantId: variantGid,
              published: product.status === "active",
              syncState: product.status === "archived" ? "archived" : product.status === "active" ? "published" : "approved",
              "shopify.variantGid": variantGid,
              ...(inventoryItemGid ? { "shopify.inventoryItemGid": inventoryItemGid } : {}),
            },
          },
        );
      }

      if (canonicalVariants.length > matchedVariantKeys.size) {
        const missing = canonicalVariants
          .filter((variant) => !matchedVariantKeys.has(variant.variantKey))
          .map((variant) => variant.variantKey);
        throw new Error(`Unmapped canonical variants: ${missing.join(", ")}`);
      }

      await bulkUpdateShopifyVariants(productGid, updates);

      await CanonicalProductModel.updateOne(
        { shopDomain: input.shopDomain, productKey: product.productKey },
        {
          $set: {
            shopifyProductId: productGid,
            migrationStatus: "linked",
            approvalStatus: product.status === "archived" ? "archived" : product.status === "active" ? "published" : "approved",
            "shopify.productGid": productGid,
            "shopify.lastPushedAt": new Date(),
            "sync.lastPushAt": new Date(),
            "sync.lastError": null,
            "sync.needsPush": false,
            "sync.dirtyAt": null,
            "sync.dirtyFields": [],
          },
        },
      );

      pushedCount += 1;
      items.push({
        key: product.productKey,
        status: willUpdate ? "updated" : "created",
        message: willUpdate ? "Updated Shopify product and variants" : "Created Shopify product and variants",
      });
    } catch (error) {
      await CanonicalProductModel.updateOne(
        { shopDomain: input.shopDomain, productKey: product.productKey },
        {
          $set: {
            "sync.lastError": error instanceof Error ? error.message : "push_failed",
          },
        },
      );
      failedCount += 1;
      const message = `${product.productKey}: ${error instanceof Error ? error.message : "push_failed"}`;
      errors.push(message);
      items.push({ key: product.productKey, status: "error", message });
    }
  }

  return { pushedCount, failedCount, skippedCount, errors, items };
}
