import {
  buildVariantOptionKey,
  normalizeFinishInternalCode,
  normalizeSizeInternalCode,
} from "./shopifyVariantOptionMapping";
import {
  logShopifyInventory,
  logSyncError,
  previewValue,
} from "./syncLogger";
import { CanonicalProductModel, type CanonicalProduct } from "../../models/CanonicalProduct";
import { CanonicalVariantModel, type CanonicalVariant } from "../../models/CanonicalVariant";

type ShopifyInventoryItemNode = {
  id?: string | null;
  sku?: string | null;
  tracked?: boolean | null;
  inventoryLevels?: {
    nodes?: ShopifyInventoryLevelNode[] | null;
  } | null;
};

type ShopifyInventoryQuantityNode = {
  name?: string | null;
  quantity?: number | null;
};

type ShopifyInventoryLevelNode = {
  id?: string | null;
  item?: {
    id?: string | null;
  } | null;
  location?: {
    id?: string | null;
  } | null;
  quantities?: ShopifyInventoryQuantityNode[] | null;
};

type ShopifyInventoryVariantNode = {
  id?: string | null;
  sku?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  inventoryItem?: ShopifyInventoryItemNode | null;
};

type ShopifyLocationNode = {
  id?: string | null;
  name?: string | null;
  fulfillsOnlineOrders?: boolean | null;
};

type ResolvedInventoryVariant = {
  variantKey: string;
  variantGid: string;
  sku: string;
  finish: string;
  sizeCode: string;
  inventoryItemGid: string;
  inventorySku: string;
  tracked: boolean;
};

export class ShopifyInventoryError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ShopifyInventoryError";
    this.details = details;
  }
}

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new ShopifyInventoryError(`Missing env var: ${name}`);
  return value;
}

function shopifyApiVersion() {
  return (process.env.SHOPIFY_API_VERSION || "2024-10").trim() || "2024-10";
}

function versionParts(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function isApiVersionAtLeast(value: string, minimum: string) {
  const current = versionParts(value);
  const target = versionParts(minimum);
  if (!current || !target) return false;
  if (current.year !== target.year) return current.year > target.year;
  return current.month >= target.month;
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function isLocationNameMatch(value?: string | null) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "artist-storage" || normalized === "artclub artist storage";
}

function selectedOptionValue(selectedOptions: Array<{ name?: string | null; value?: string | null }> | null | undefined, pattern: RegExp) {
  const match = (selectedOptions || []).find((option) => pattern.test(option.name || ""));
  return match?.value?.trim() || "";
}

function optionPairFromSelectedOptions(selectedOptions: Array<{ name?: string | null; value?: string | null }> | null | undefined) {
  const finishRaw =
    selectedOptionValue(selectedOptions, /finish|material|frame/i) ||
    selectedOptions?.[0]?.value?.trim() ||
    "";
  const sizeRaw =
    selectedOptionValue(selectedOptions, /size|format|dimension/i) ||
    selectedOptions?.[1]?.value?.trim() ||
    "";

  return {
    finish: normalizeFinishInternalCode(finishRaw),
    sizeCode: normalizeSizeInternalCode(sizeRaw),
  };
}

async function callShopifyAdmin<TData>(query: string, variables: Record<string, unknown>): Promise<TData | undefined> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const url = `https://${shop}/admin/api/${shopifyApiVersion()}/graphql.json`;

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
  let json: { data?: TData; errors?: unknown } | null = null;
  try {
    json = JSON.parse(text) as { data?: TData; errors?: unknown };
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new ShopifyInventoryError(`Shopify API error ${res.status}`, {
      status: res.status,
      responseBodyPreview: previewValue(text, 300),
      graphqlErrors: json?.errors ?? null,
    });
  }

  if (!json) {
    throw new ShopifyInventoryError("Shopify returned invalid JSON", {
      responseBodyPreview: previewValue(text, 300),
    });
  }

  if (json.errors) {
    throw new ShopifyInventoryError("Shopify GraphQL errors", {
      graphqlErrors: json.errors,
    });
  }

  return json.data;
}

export function getShopifyPrintInventoryQuantity() {
  return toPositiveInt(process.env.SHOPIFY_PRINT_INVENTORY_QUANTITY, 50);
}

export function getShopifyOriginalInventoryQuantity() {
  return toPositiveInt(process.env.SHOPIFY_ORIGINAL_INVENTORY_QUANTITY, 1);
}

async function validateShopifyLocationById(locationId: string) {
  const data = await callShopifyAdmin<{
    location?: ShopifyLocationNode | null;
  }>(
    `
      query InventoryLocationById($id: ID!) {
        location(id: $id) {
          id
          name
          fulfillsOnlineOrders
        }
      }
    `,
    { id: locationId },
  );

  return data?.location || null;
}

async function fetchShopifyLocations() {
  const data = await callShopifyAdmin<{
    locations?: {
      nodes?: ShopifyLocationNode[] | null;
    } | null;
  }>(
    `
      query InventoryLocations {
        locations(first: 50) {
          nodes {
            id
            name
            fulfillsOnlineOrders
          }
        }
      }
    `,
    {},
  );

  return data?.locations?.nodes || [];
}

async function createArtistStorageLocation(configuredName: string) {
  const countryCode = (process.env.SHOPIFY_ARTIST_STORAGE_COUNTRY_CODE || "").trim().toUpperCase();
  if (!countryCode) {
    throw new ShopifyInventoryError("artist_storage_location_missing", {
      code: "artist_storage_location_missing",
      message: "Create a Shopify location named Artist-Storage and set SHOPIFY_ARTIST_STORAGE_LOCATION_ID",
    });
  }

  const data = await callShopifyAdmin<{
    locationAdd?: {
      location?: ShopifyLocationNode | null;
      userErrors?: Array<{ field?: string[] | null; message?: string; code?: string | null }>;
    } | null;
  }>(
    `
      mutation AddArtistStorageLocation($input: LocationAddInput!) {
        locationAdd(input: $input) {
          location {
            id
            name
            fulfillsOnlineOrders
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      input: {
        name: configuredName,
        address: {
          ...(process.env.SHOPIFY_ARTIST_STORAGE_ADDRESS1 ? { address1: process.env.SHOPIFY_ARTIST_STORAGE_ADDRESS1.trim() } : {}),
          ...(process.env.SHOPIFY_ARTIST_STORAGE_CITY ? { city: process.env.SHOPIFY_ARTIST_STORAGE_CITY.trim() } : {}),
          ...(process.env.SHOPIFY_ARTIST_STORAGE_ZIP ? { zip: process.env.SHOPIFY_ARTIST_STORAGE_ZIP.trim() } : {}),
          countryCode,
        },
        fulfillsOnlineOrders: true,
      },
    },
  );

  const payload = data?.locationAdd;
  if (!payload?.location?.id || payload.userErrors?.length) {
    throw new ShopifyInventoryError("artist_storage_location_missing", {
      code: "artist_storage_location_missing",
      message: "Create a Shopify location named Artist-Storage and set SHOPIFY_ARTIST_STORAGE_LOCATION_ID",
      userErrors: payload?.userErrors || [],
    });
  }

  return payload.location;
}

let cachedLocation: { id: string; name: string; source: "env" | "existing_shopify_location" | "created" } | null = null;

export async function getArtistStorageLocation(runId: string) {
  if (cachedLocation?.id) return cachedLocation;

  const envLocationId = (process.env.SHOPIFY_ARTIST_STORAGE_LOCATION_ID || "").trim();
  const configuredLocationName = (process.env.SHOPIFY_ARTIST_STORAGE_NAME || "Artist-Storage").trim() || "Artist-Storage";

  logShopifyInventory(
    "shopify_artist_storage_location_resolve_started",
    {
      hasEnvLocationId: Boolean(envLocationId),
      configuredLocationName,
    },
    { runId, force: true },
  );

  if (envLocationId) {
    const location = await validateShopifyLocationById(envLocationId);
    if (!location?.id) {
      throw new ShopifyInventoryError("artist_storage_location_missing", {
        code: "artist_storage_location_missing",
        message: "Create a Shopify location named Artist-Storage and set SHOPIFY_ARTIST_STORAGE_LOCATION_ID",
        locationId: envLocationId,
      });
    }

    cachedLocation = {
      id: location.id,
      name: location.name || configuredLocationName,
      source: "env",
    };
    logShopifyInventory("shopify_artist_storage_location_resolved", cachedLocation, { runId, force: true });
    return cachedLocation;
  }

  const locations = await fetchShopifyLocations();
  const existing = locations.find((location) => isLocationNameMatch(location.name) || location.name?.trim() === configuredLocationName);
  if (existing?.id) {
    cachedLocation = {
      id: existing.id,
      name: existing.name || configuredLocationName,
      source: "existing_shopify_location",
    };
    logShopifyInventory("shopify_artist_storage_location_resolved", cachedLocation, { runId, force: true });
    return cachedLocation;
  }

  const created = await createArtistStorageLocation(configuredLocationName);
  cachedLocation = {
    id: created.id || "",
    name: created.name || configuredLocationName,
    source: "created",
  };
  logShopifyInventory("shopify_artist_storage_location_resolved", cachedLocation, { runId, force: true });
  return cachedLocation;
}

export async function fetchShopifyProductInventoryState(productGid: string) {
  const data = await callShopifyAdmin<{
    product?: {
      variants?: {
        nodes?: ShopifyInventoryVariantNode[] | null;
      } | null;
    } | null;
  }>(
    `
      query InventoryProductState($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            nodes {
              id
              sku
              selectedOptions {
                name
                value
              }
              inventoryItem {
                id
                sku
                tracked
                inventoryLevels(first: 20) {
                  nodes {
                    location {
                      id
                    }
                    quantities(names: ["available"]) {
                      name
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { id: productGid },
  );

  return data?.product?.variants?.nodes || [];
}

export async function persistResolvedInventoryItems(input: {
  shopDomain: string;
  productKey: string;
  productGid: string;
  variants: ShopifyInventoryVariantNode[];
  runId: string;
}) {
  const canonicalVariants = await CanonicalVariantModel.find({
    shopDomain: input.shopDomain,
    productKey: input.productKey,
  }).lean();

  const byVariantGid = new Map(
    canonicalVariants
      .filter((variant) => variant.shopify?.variantGid || variant.shopifyVariantId)
      .map((variant) => [variant.shopify?.variantGid || variant.shopifyVariantId || "", variant] as const),
  );
  const bySku = new Map(
    canonicalVariants
      .filter((variant) => variant.sku)
      .map((variant) => [variant.sku.trim(), variant] as const),
  );
  const byOptionKey = new Map(
    canonicalVariants.map((variant) => [buildVariantOptionKey(variant.finish, variant.sizeCode), variant] as const),
  );

  const resolved: ResolvedInventoryVariant[] = [];

  for (const shopifyVariant of input.variants) {
    const pair = optionPairFromSelectedOptions(shopifyVariant.selectedOptions);
    const matched =
      (shopifyVariant.id ? byVariantGid.get(shopifyVariant.id) : undefined) ||
      (shopifyVariant.sku ? bySku.get(shopifyVariant.sku.trim()) : undefined) ||
      byOptionKey.get(buildVariantOptionKey(pair.finish, pair.sizeCode));

    if (!matched || !shopifyVariant.id || !shopifyVariant.inventoryItem?.id) continue;

    const tracked = shopifyVariant.inventoryItem.tracked !== false;
    const inventorySku = (shopifyVariant.inventoryItem.sku || shopifyVariant.sku || matched.sku || "").trim();

    await CanonicalVariantModel.updateOne(
      { _id: matched._id, shopDomain: input.shopDomain, productKey: input.productKey },
      {
        $set: {
          shopifyVariantId: shopifyVariant.id,
          "shopify.variantGid": shopifyVariant.id,
          "shopify.inventoryItemGid": shopifyVariant.inventoryItem.id,
          "shopify.inventorySku": inventorySku || undefined,
          "inventory.tracked": tracked,
        },
      },
    );

    resolved.push({
      variantKey: matched.variantKey,
      variantGid: shopifyVariant.id,
      sku: (shopifyVariant.sku || matched.sku || "").trim(),
      finish: matched.finish,
      sizeCode: matched.sizeCode,
      inventoryItemGid: shopifyVariant.inventoryItem.id,
      inventorySku,
      tracked,
    });
  }

  logShopifyInventory(
    "shopify_inventory_items_resolved",
    {
      productGid: input.productGid,
      variantCount: resolved.length,
      variants: resolved.map((variant) => ({
        variantId: variant.variantGid,
        sku: variant.sku,
        inventoryItemId: variant.inventoryItemGid,
        finish: variant.finish,
        size: variant.sizeCode,
      })),
    },
    { runId: input.runId, force: true },
  );

  return resolved;
}

function desiredSeedQuantityForVariant(product: CanonicalProduct, variant: CanonicalVariant) {
  const finish = normalizeFinishInternalCode(variant.finish);
  if (finish === "original") {
    return product.originalAvailable === true && product.forSale === true ? getShopifyOriginalInventoryQuantity() : 0;
  }
  return product.allowPrints === true ? getShopifyPrintInventoryQuantity() : 0;
}

function editionLimitForVariant(product: CanonicalProduct, variant: CanonicalVariant) {
  const finish = normalizeFinishInternalCode(variant.finish);
  return finish === "original"
    ? product.originalAvailable === true && product.forSale === true
      ? getShopifyOriginalInventoryQuantity()
      : 0
    : product.allowPrints === true
      ? getShopifyPrintInventoryQuantity()
      : 0;
}

function currentQuantityAtLocation(item: ShopifyInventoryItemNode | null | undefined, locationId: string) {
  const level = item?.inventoryLevels?.nodes?.find((node) => node?.location?.id === locationId);
  const quantity = level?.quantities?.find((entry) => (entry?.name || "").trim().toLowerCase() === "available")?.quantity;
  return typeof quantity === "number" && Number.isFinite(quantity) ? quantity : 0;
}

function inventoryLevelAtLocation(item: ShopifyInventoryItemNode | null | undefined, locationId: string) {
  return item?.inventoryLevels?.nodes?.find((node) => node?.location?.id === locationId) || null;
}

async function enableInventoryTracking(variants: ResolvedInventoryVariant[], runId: string) {
  const failures: Array<Record<string, unknown>> = [];

  for (const variant of variants) {
    if (!variant.inventoryItemGid || variant.tracked) continue;

    try {
      const data = await callShopifyAdmin<{
        inventoryItemUpdate?: {
          inventoryItem?: { id?: string | null; tracked?: boolean | null } | null;
          userErrors?: Array<{ field?: string[] | null; message?: string }>;
        } | null;
      }>(
        `
          mutation EnableInventoryTracking($id: ID!, $input: InventoryItemInput!) {
            inventoryItemUpdate(id: $id, input: $input) {
              inventoryItem {
                id
                tracked
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          id: variant.inventoryItemGid,
          input: {
            tracked: true,
          },
        },
      );

      const payload = data?.inventoryItemUpdate;
      if (payload?.userErrors?.length || payload?.inventoryItem?.tracked === false) {
        failures.push({
          variantId: variant.variantGid,
          inventoryItemId: variant.inventoryItemGid,
          userErrors: payload?.userErrors || [],
        });
        continue;
      }

      await CanonicalVariantModel.updateOne(
        { shopifyVariantId: variant.variantGid },
        {
          $set: {
            "inventory.tracked": true,
          },
        },
      );
    } catch (error) {
      failures.push({
        variantId: variant.variantGid,
        inventoryItemId: variant.inventoryItemGid,
        errorMessage: error instanceof Error ? error.message : "inventory_tracking_enable_failed",
      });
    }
  }

  if (!failures.length) return;

  logShopifyInventory(
    "shopify_inventory_tracking_enable_failed",
    {
      failures,
    },
    { runId, force: true },
  );

  throw new ShopifyInventoryError("shopify_inventory_tracking_enable_failed", {
    failures,
  });
}

async function setShopifyInventoryQuantities(input: {
  productGid: string;
  locationId: string;
  quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number; sku: string }>;
  idempotencyKey: string;
  referenceDocumentUri: string;
  runId: string;
}) {
  logShopifyInventory(
    "shopify_inventory_set_quantities_payload",
    {
      productGid: input.productGid,
      locationId: input.locationId,
      quantities: input.quantities.map((item) => ({
        sku: item.sku,
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        reason: "correction",
      })),
    },
    { runId: input.runId, force: true },
  );

  const version = shopifyApiVersion();
  const useIdempotency = isApiVersionAtLeast(version, "2026-01");
  const query = useIdempotency
    ? `
        mutation SetInventoryQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
          inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
            inventoryAdjustmentGroup {
              reason
              referenceDocumentUri
              changes {
                name
                delta
                quantityAfterChange
              }
            }
            userErrors {
              code
              field
              message
            }
          }
        }
      `
    : `
        mutation SetInventoryQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup {
              reason
              referenceDocumentUri
              changes {
                name
                delta
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

  const variables: Record<string, unknown> = {
    input: {
      name: "available",
      reason: "correction",
      referenceDocumentUri: input.referenceDocumentUri,
      ignoreCompareQuantity: true,
      quantities: input.quantities.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        locationId: item.locationId,
        quantity: item.quantity,
      })),
    },
  };

  if (useIdempotency) {
    variables.idempotencyKey = input.idempotencyKey;
  }

  const data = await callShopifyAdmin<{
    inventorySetQuantities?: {
      inventoryAdjustmentGroup?: {
        reason?: string | null;
        referenceDocumentUri?: string | null;
        changes?: Array<{ name?: string | null; delta?: number | null; quantityAfterChange?: number | null }> | null;
      } | null;
      userErrors?: Array<{ code?: string | null; field?: string[] | null; message?: string }>;
    } | null;
  }>(query, variables);

  const payload = data?.inventorySetQuantities;
  if (!payload) {
    throw new ShopifyInventoryError("Shopify inventorySetQuantities returned no payload");
  }

  if (payload.userErrors?.length) {
    logShopifyInventory(
      "shopify_inventory_set_quantities_response",
      {
        productGid: input.productGid,
        locationId: input.locationId,
        userErrors: payload.userErrors || [],
        graphqlErrors: [],
        syncedCount: 0,
      },
      { runId: input.runId, force: true },
    );
    throw new ShopifyInventoryError("Shopify inventorySetQuantities failed", {
      userErrors: payload.userErrors,
      graphqlErrors: [],
    });
  }

  logShopifyInventory(
    "shopify_inventory_set_quantities_response",
    {
      productGid: input.productGid,
      locationId: input.locationId,
      userErrors: [],
      graphqlErrors: [],
      syncedCount: input.quantities.length,
    },
    { runId: input.runId, force: true },
  );

  return payload;
}

async function activateInventoryAtLocation(input: {
  productGid: string;
  inventoryItemId: string;
  locationId: string;
  available: number;
  sku: string;
  idempotencyKey: string;
  runId: string;
}) {
  const version = shopifyApiVersion();
  const useIdempotency = isApiVersionAtLeast(version, "2026-04");
  const query = useIdempotency
    ? `
        mutation ActivateInventoryItem(
          $inventoryItemId: ID!,
          $locationId: ID!,
          $available: Int,
          $idempotencyKey: String!
        ) {
          inventoryActivate(
            inventoryItemId: $inventoryItemId,
            locationId: $locationId,
            available: $available
          ) @idempotent(key: $idempotencyKey) {
            inventoryLevel {
              id
              quantities(names: ["available"]) {
                name
                quantity
              }
              item {
                id
              }
              location {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `
    : `
        mutation ActivateInventoryItem(
          $inventoryItemId: ID!,
          $locationId: ID!,
          $available: Int
        ) {
          inventoryActivate(
            inventoryItemId: $inventoryItemId,
            locationId: $locationId,
            available: $available
          ) {
            inventoryLevel {
              id
              quantities(names: ["available"]) {
                name
                quantity
              }
              item {
                id
              }
              location {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
  const variables: Record<string, unknown> = {
    inventoryItemId: input.inventoryItemId,
    locationId: input.locationId,
    available: input.available,
  };
  if (useIdempotency) {
    variables.idempotencyKey = input.idempotencyKey;
  }

  logShopifyInventory(
    "shopify_inventory_activate_payload",
    {
      sku: input.sku,
      inventoryItemId: input.inventoryItemId,
      locationId: input.locationId,
      available: input.available,
      idempotencyKey: input.idempotencyKey,
    },
    { runId: input.runId, force: true },
  );

  const data = await callShopifyAdmin<{
    inventoryActivate?: {
      inventoryLevel?: ShopifyInventoryLevelNode | null;
      userErrors?: Array<{ field?: string[] | null; message?: string }>;
    } | null;
  }>(query, variables);

  const payload = data?.inventoryActivate;
  if (!payload) {
    throw new ShopifyInventoryError("Shopify inventoryActivate returned no payload");
  }

  const available =
    payload.inventoryLevel?.quantities?.find((entry) => (entry?.name || "").trim().toLowerCase() === "available")?.quantity ?? null;

  logShopifyInventory(
    "shopify_inventory_activate_response",
    {
      sku: input.sku,
      inventoryItemId: input.inventoryItemId,
      inventoryLevelId: payload.inventoryLevel?.id || null,
      available,
      userErrors: payload.userErrors || [],
      graphqlErrors: [],
    },
    { runId: input.runId, force: true },
  );

  if (payload.userErrors?.length) {
    throw new ShopifyInventoryError("Shopify inventoryActivate failed", {
      userErrors: payload.userErrors,
      graphqlErrors: [],
      inventoryItemId: input.inventoryItemId,
      locationId: input.locationId,
      sku: input.sku,
    });
  }

  return payload.inventoryLevel || null;
}

export async function seedProductInventoryIfNeeded(input: {
  shopDomain: string;
  productKey: string;
  runId: string;
  jobId?: string;
  attempt?: number;
}) {
  const product = await CanonicalProductModel.findOne({
    shopDomain: input.shopDomain,
    productKey: input.productKey,
  }).lean();

  if (!product?._id) {
    throw new ShopifyInventoryError("canonical_product_not_found", {
      productKey: input.productKey,
      shopDomain: input.shopDomain,
    });
  }

  const productGid = product.shopify?.productGid || product.shopifyProductId;
  if (!productGid) {
    throw new ShopifyInventoryError("shopify_product_missing", {
      productKey: input.productKey,
      canonicalProductId: String(product._id),
    });
  }

  try {
    logShopifyInventory(
      "shopify_inventory_seed_started",
      {
        canonicalProductId: String(product._id),
        productKey: input.productKey,
        productGid,
        jobId: input.jobId || null,
      },
      { runId: input.runId, force: true },
    );

    const shopifyVariants = await fetchShopifyProductInventoryState(productGid);
    const resolvedInventoryItems = await persistResolvedInventoryItems({
      shopDomain: input.shopDomain,
      productKey: input.productKey,
      productGid,
      variants: shopifyVariants,
      runId: input.runId,
    });

    await enableInventoryTracking(resolvedInventoryItems, input.runId);

    const canonicalVariants = await CanonicalVariantModel.find({
      shopDomain: input.shopDomain,
      productKey: input.productKey,
    }).lean();
    const canonicalVariantByGid = new Map(
      canonicalVariants
        .filter((variant) => variant.shopify?.variantGid || variant.shopifyVariantId)
        .map((variant) => [variant.shopify?.variantGid || variant.shopifyVariantId || "", variant] as const),
    );
    const shopifyVariantByGid = new Map(
      shopifyVariants.filter((variant) => variant?.id).map((variant) => [variant.id || "", variant] as const),
    );

    const location = await getArtistStorageLocation(input.runId);
    const now = new Date();
    const variantsNeedingActivation: Array<{
      canonicalVariantId: string;
      variantKey: string;
      sku: string;
      inventoryItemId: string;
      quantity: number;
      editionLimit: number;
    }> = [];
    const quantitiesToSeed: Array<{
      inventoryItemId: string;
      locationId: string;
      quantity: number;
      sku: string;
      variantGid: string;
      variantKey: string;
      canonicalVariantId: string;
      editionLimit: number;
    }> = [];
    const variantActions: Array<Record<string, unknown>> = [];
    let skippedAlreadySeededCount = 0;
    let preservedExistingQuantityCount = 0;
    let failedCount = 0;

    for (const resolvedVariant of resolvedInventoryItems) {
      const canonicalVariant = canonicalVariantByGid.get(resolvedVariant.variantGid);
      if (!canonicalVariant) continue;

      const shopifyVariant = shopifyVariantByGid.get(resolvedVariant.variantGid);
      const inventoryLevel = inventoryLevelAtLocation(shopifyVariant?.inventoryItem, location.id);
      const currentQuantity = currentQuantityAtLocation(shopifyVariant?.inventoryItem, location.id);
      const editionLimit = editionLimitForVariant(product, canonicalVariant);

      if (canonicalVariant.inventory?.inventorySeededAt) {
        skippedAlreadySeededCount += 1;
        await CanonicalVariantModel.updateOne(
          { _id: canonicalVariant._id },
          {
            $set: {
              "inventory.locationId": location.id,
              "inventory.quantity": currentQuantity,
              "inventory.availableQuantity": currentQuantity,
              "inventory.inventorySeedStatus": "seeded",
              "inventory.inventorySyncStatus": "seeded",
              "inventory.lastInventorySyncAt": now,
              "inventory.replenishmentDisabled": true,
              "inventory.editionLimit": editionLimit,
              "inventory.lastInventoryError": null,
            },
          },
        );
        logShopifyInventory(
          "shopify_inventory_seed_skipped",
          {
            canonicalProductId: String(product._id),
            productKey: input.productKey,
            variantKey: canonicalVariant.variantKey,
            sku: canonicalVariant.sku,
            inventoryItemId: resolvedVariant.inventoryItemGid,
            currentQuantity,
            reason: "already_seeded",
          },
          { runId: input.runId, force: true },
        );
        variantActions.push({
          variantKey: canonicalVariant.variantKey,
          sku: canonicalVariant.sku,
          inventoryItemId: resolvedVariant.inventoryItemGid,
          currentQuantity,
          action: "skipped_already_seeded",
        });
        continue;
      }

      if (!inventoryLevel) {
        variantsNeedingActivation.push({
          canonicalVariantId: String(canonicalVariant._id),
          variantKey: canonicalVariant.variantKey,
          sku: resolvedVariant.sku || resolvedVariant.inventorySku || resolvedVariant.variantKey,
          inventoryItemId: resolvedVariant.inventoryItemGid,
          quantity: desiredSeedQuantityForVariant(product, canonicalVariant),
          editionLimit,
        });
        continue;
      }

      if (currentQuantity > 0) {
        preservedExistingQuantityCount += 1;
        await CanonicalVariantModel.updateOne(
          { _id: canonicalVariant._id },
          {
            $set: {
              "inventory.locationId": location.id,
              "inventory.quantity": currentQuantity,
              "inventory.availableQuantity": currentQuantity,
              "inventory.initialQuantity": currentQuantity,
              "inventory.inventorySeededAt": now,
              "inventory.inventorySeedJobId": input.jobId || null,
              "inventory.inventorySeedStatus": "seeded",
              "inventory.inventorySyncStatus": "seeded",
              "inventory.lastInventorySyncAt": now,
              "inventory.replenishmentDisabled": true,
              "inventory.editionLimit": editionLimit,
              "inventory.lastInventoryError": null,
            },
          },
        );
        logShopifyInventory(
          "shopify_inventory_already_stocked",
          {
            canonicalProductId: String(product._id),
            productKey: input.productKey,
            variantKey: canonicalVariant.variantKey,
            sku: canonicalVariant.sku,
            inventoryItemId: resolvedVariant.inventoryItemGid,
            locationId: location.id,
            currentQuantity,
            seededQuantity: currentQuantity,
            reason: "existing_quantity_preserved",
          },
          { runId: input.runId, force: true },
        );
        variantActions.push({
          variantKey: canonicalVariant.variantKey,
          sku: canonicalVariant.sku,
          inventoryItemId: resolvedVariant.inventoryItemGid,
          currentQuantity,
          action: "preserved_existing_quantity",
        });
        continue;
      }

      quantitiesToSeed.push({
        inventoryItemId: resolvedVariant.inventoryItemGid,
        locationId: location.id,
        quantity: desiredSeedQuantityForVariant(product, canonicalVariant),
        sku: resolvedVariant.sku || resolvedVariant.inventorySku || resolvedVariant.variantKey,
        variantGid: resolvedVariant.variantGid,
        variantKey: canonicalVariant.variantKey,
        canonicalVariantId: String(canonicalVariant._id),
        editionLimit,
      });
    }

    if (!resolvedInventoryItems.length) {
      throw new ShopifyInventoryError("shopify_inventory_items_missing", {
        productGid,
        productKey: input.productKey,
      });
    }

    const referenceDocumentUri = `artclub://shopify-sync/${input.jobId || input.runId}/${input.productKey}`;
    const idempotencyKey = `${input.jobId || input.runId}:${input.productKey}:${input.attempt || 1}`;
    if (variantsNeedingActivation.length) {
      logShopifyInventory(
        "shopify_inventory_activation_started",
        {
          productGid,
          locationId: location.id,
          variantCount: variantsNeedingActivation.length,
        },
        { runId: input.runId, force: true },
      );

      for (const [index, entry] of variantsNeedingActivation.entries()) {
        const activationLevel = await activateInventoryAtLocation({
          productGid,
          inventoryItemId: entry.inventoryItemId,
          locationId: location.id,
          available: entry.quantity,
          sku: entry.sku,
          idempotencyKey: `${idempotencyKey}:activate:${index + 1}:${entry.inventoryItemId}`,
          runId: input.runId,
        });
        const activatedQuantity =
          activationLevel?.quantities?.find((quantity) => (quantity?.name || "").trim().toLowerCase() === "available")?.quantity ??
          entry.quantity;
        await CanonicalVariantModel.updateOne(
          {
            _id: entry.canonicalVariantId,
            shopDomain: input.shopDomain,
            productKey: input.productKey,
          },
          {
            $set: {
              "inventory.locationId": location.id,
              "inventory.quantity": activatedQuantity,
              "inventory.availableQuantity": activatedQuantity,
              "inventory.initialQuantity": activatedQuantity,
              "inventory.inventorySeededAt": now,
              "inventory.inventorySeedJobId": input.jobId || null,
              "inventory.inventorySeedStatus": "seeded",
              "inventory.inventorySyncStatus": "seeded",
              "inventory.lastInventorySyncAt": now,
              "inventory.tracked": true,
              "inventory.replenishmentDisabled": true,
              "inventory.editionLimit": entry.editionLimit,
              "inventory.lastInventoryError": null,
            },
          },
        );
        variantActions.push({
          variantKey: entry.variantKey,
          sku: entry.sku,
          inventoryItemId: entry.inventoryItemId,
          currentQuantity: activatedQuantity,
          action: "activated_and_seeded",
        });
      }
    }

    if (quantitiesToSeed.length) {
      await setShopifyInventoryQuantities({
        productGid,
        locationId: location.id,
        quantities: quantitiesToSeed.map((entry) => ({
          inventoryItemId: entry.inventoryItemId,
          locationId: entry.locationId,
          quantity: entry.quantity,
          sku: entry.sku,
        })),
        idempotencyKey,
        referenceDocumentUri,
        runId: input.runId,
      });

      for (const entry of quantitiesToSeed) {
        await CanonicalVariantModel.updateOne(
          {
            _id: entry.canonicalVariantId,
            shopDomain: input.shopDomain,
            productKey: input.productKey,
          },
          {
            $set: {
              "inventory.locationId": location.id,
              "inventory.quantity": entry.quantity,
              "inventory.availableQuantity": entry.quantity,
              "inventory.initialQuantity": entry.quantity,
              "inventory.inventorySeededAt": now,
              "inventory.inventorySeedJobId": input.jobId || null,
              "inventory.inventorySeedStatus": "seeded",
              "inventory.inventorySyncStatus": "seeded",
              "inventory.lastInventorySyncAt": now,
              "inventory.tracked": true,
              "inventory.replenishmentDisabled": true,
              "inventory.editionLimit": entry.editionLimit,
              "inventory.lastInventoryError": null,
            },
          },
        );
        logShopifyInventory(
          "shopify_inventory_seed_done",
          {
            canonicalProductId: String(product._id),
            productKey: input.productKey,
            variantKey: entry.variantKey,
            sku: entry.sku,
            inventoryItemId: entry.inventoryItemId,
            seededQuantity: entry.quantity,
            reason: "initial_seed",
          },
          { runId: input.runId, force: true },
        );
        variantActions.push({
          variantKey: entry.variantKey,
          sku: entry.sku,
          inventoryItemId: entry.inventoryItemId,
          currentQuantity: entry.quantity,
          action: "seeded",
        });
      }
    }

    await CanonicalProductModel.updateOne(
      { _id: product._id, shopDomain: input.shopDomain, productKey: input.productKey },
      {
        $set: {
          status: product.status === "archived" ? "archived" : "shopify_synced",
          "sync.status": "synced",
          "sync.inventoryStatus": "seeded",
          "sync.inventorySeedStatus": "seeded",
          "sync.needsPush": false,
          "sync.needsInventorySeed": false,
          "sync.lastInventorySyncAt": now,
          "sync.lastInventorySeededAt": now,
          "sync.lastError": null,
        },
      },
    );

    logShopifyInventory(
      "shopify_inventory_seed_done",
      {
        canonicalProductId: String(product._id),
        productKey: input.productKey,
        productGid,
        locationId: location.id,
        seededCount: variantsNeedingActivation.length + quantitiesToSeed.length,
        skippedCount: skippedAlreadySeededCount,
        preservedCount: preservedExistingQuantityCount,
        failedCount,
      },
      { runId: input.runId, force: true },
    );

    return {
      productGid,
      locationId: location.id,
      seededCount: variantsNeedingActivation.length + quantitiesToSeed.length,
      skippedAlreadySeededCount,
      preservedExistingQuantityCount,
      failedCount,
      variantActions,
    };
  } catch (error) {
    const details =
      error instanceof ShopifyInventoryError && error.details && typeof error.details === "object" ? error.details : undefined;
    const locationId = typeof details?.locationId === "string" ? details.locationId : null;

    await CanonicalProductModel.updateOne(
      { _id: product._id, shopDomain: input.shopDomain, productKey: input.productKey },
      {
        $set: {
          "sync.inventoryStatus": "error",
          "sync.inventorySeedStatus": "error",
          "sync.status": "inventory_seed_error",
          "sync.needsPush": true,
          "sync.needsInventorySeed": true,
          "sync.lastError": error instanceof Error ? error.message : "shopify_inventory_sync_failed",
        },
      },
    );

    await CanonicalVariantModel.updateMany(
      { shopDomain: input.shopDomain, productKey: input.productKey },
      {
        $set: {
          "inventory.inventorySeedStatus": "error",
          "inventory.inventorySyncStatus": "error",
          "inventory.lastInventoryError": error instanceof Error ? error.message : "shopify_inventory_sync_failed",
        },
      },
    );

    logSyncError(
      "shopify_inventory_seed_failed",
      error,
      {
        productKey: input.productKey,
        canonicalProductId: String(product._id),
        productGid,
        locationId,
        errorMessage: error instanceof Error ? error.message : "shopify_inventory_sync_failed",
        userErrors: details?.userErrors || null,
        graphqlErrors: details?.graphqlErrors || null,
      },
      { runId: input.runId, force: true },
    );

    throw error;
  }
}

export async function syncProductInventoryToShopify(input: {
  shopDomain: string;
  productKey: string;
  runId: string;
  jobId?: string;
  attempt?: number;
  markProductSynced?: boolean;
}) {
  return seedProductInventoryIfNeeded({
    shopDomain: input.shopDomain,
    productKey: input.productKey,
    runId: input.runId,
    jobId: input.jobId,
    attempt: input.attempt,
  });
}
