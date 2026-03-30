import { buildProductMetafieldsForArtwork, upsertArtistMetaobject } from "@/lib/shopify";
import { connectMongo } from "@/lib/mongodb";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel, type CanonicalProduct } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

type PushInput = {
  shopDomain: string;
  limit?: number;
};

type PushResult = {
  pushedCount: number;
  failedCount: number;
  errors: string[];
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
  await connectMongo();

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 250);
  const artists = await CanonicalArtistModel.find({
    shopDomain: input.shopDomain,
    "sync.needsPush": true,
  })
    .sort({ "sync.dirtyAt": 1, updatedAt: 1 })
    .limit(limit)
    .lean();

  let pushedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const artist of artists) {
    try {
      const fields = {
        name: artist.displayName,
        instagram: artist.instagram || undefined,
        bilder: artist.profileImages?.heroUrl || undefined,
        bild_1: artist.profileImages?.avatarUrl || undefined,
      };

      const result = await upsertArtistMetaobject({
        metaobjectId: artist.shopify?.metaobjectGid || undefined,
        handle: artist.handle,
        fields,
      });

      await CanonicalArtistModel.updateOne(
        { shopDomain: input.shopDomain, artistKey: artist.artistKey },
        {
          $set: {
            "shopify.metaobjectGid": result.id,
            "shopify.lastPushedAt": new Date(),
            "sync.needsPush": false,
            "sync.dirtyAt": null,
            "sync.dirtyFields": [],
          },
        },
      );

      pushedCount += 1;
    } catch (error) {
      failedCount += 1;
      errors.push(`${artist.artistKey}: ${error instanceof Error ? error.message : "push_failed"}`);
    }
  }

  return { pushedCount, failedCount, errors };
}

export async function pushProducts(input: PushInput): Promise<PushResult> {
  await connectMongo();

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 250);
  const products = await CanonicalProductModel.find({
    shopDomain: input.shopDomain,
    "sync.needsPush": true,
  })
    .sort({ "sync.dirtyAt": 1, updatedAt: 1 })
    .limit(limit)
    .lean();

  let pushedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const product of products) {
    try {
      if (product.status === "db_only") {
        await CanonicalProductModel.updateOne(
          { shopDomain: input.shopDomain, productKey: product.productKey },
          {
            $set: {
              "shopify.lastPushedAt": new Date(),
              "sync.needsPush": false,
              "sync.dirtyAt": null,
              "sync.dirtyFields": [],
            },
          },
        );
        pushedCount += 1;
        continue;
      }

      let productGid = product.shopify?.productGid || "";
      let defaultVariantId: string | null = null;
      let defaultInventoryItemId: string | null = null;

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
        const fallbackDefault = !variant.shopify?.variantGid && !matchedBySku && index === 0 ? defaultVariantId : null;
        const variantGid = variant.shopify?.variantGid || matchedBySku?.id || fallbackDefault || null;
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
            "shopify.productGid": productGid,
            "shopify.lastPushedAt": new Date(),
            "sync.needsPush": false,
            "sync.dirtyAt": null,
            "sync.dirtyFields": [],
          },
        },
      );

      pushedCount += 1;
    } catch (error) {
      failedCount += 1;
      errors.push(`${product.productKey}: ${error instanceof Error ? error.message : "push_failed"}`);
    }
  }

  return { pushedCount, failedCount, errors };
}
