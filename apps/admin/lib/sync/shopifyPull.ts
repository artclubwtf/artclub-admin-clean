import { connectMongo } from "@/lib/mongodb";
import {
  KUENSTLER_FIELD_KEYS,
  PRODUCT_METAFIELD_KEYS,
  SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
  SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
} from "@/lib/shopify";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

type PullInput = {
  shopDomain: string;
  limit?: number;
  cursor?: string | null;
};

type PullMode = "sync" | "import";

type PullResult = {
  importedCount: number;
  cursor: string | null;
};

type ShopifyGraphQLResponse<TData> = {
  data?: TData;
  errors?: unknown;
};

type MetaobjectNode = {
  id?: string | null;
  handle?: string | null;
  fields?: Array<{ key?: string | null; value?: string | null }> | null;
};

type ArtistPageResponse = {
  metaobjects?: {
    edges?: Array<{ node?: MetaobjectNode | null }> | null;
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  } | null;
};

type ProductVariantNode = {
  id?: string | null;
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  inventoryItem?: { id?: string | null; tracked?: boolean | null } | null;
};

type ProductNode = {
  id?: string | null;
  title?: string | null;
  handle?: string | null;
  description?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  tags?: string[] | null;
  status?: string | null;
  featuredImage?: { url?: string | null } | null;
  images?: { nodes?: Array<{ url?: string | null }> | null } | null;
  artistMetaobject?: {
    value?: string | null;
    reference?: { id?: string | null } | null;
  } | null;
  metafieldWidth?: { value?: string | null } | null;
  metafieldHeight?: { value?: string | null } | null;
  metafieldKurzbeschreibung?: { value?: string | null } | null;
  variants?: { nodes?: ProductVariantNode[] | null } | null;
};

type ProductPageResponse = {
  products?: {
    edges?: Array<{ node?: ProductNode | null }> | null;
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  } | null;
};

function mustShopifyEnv(): { shop: string; token: string; version: string } {
  const shop = resolveShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN);
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shop || !token) {
    throw new Error("Missing Shopify credentials (SHOPIFY_SHOP_DOMAIN/SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN)");
  }
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  return { shop, token, version };
}

async function callShopifyAdmin<TData>(query: string, variables: Record<string, unknown>): Promise<TData | undefined> {
  const { shop, token, version } = mustShopifyEnv();
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
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as ShopifyGraphQLResponse<TData>;
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

function toFieldMap(fields?: Array<{ key?: string | null; value?: string | null }> | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields || []) {
    const key = field?.key?.trim();
    const value = field?.value?.trim();
    if (!key || !value) continue;
    map[key] = value;
  }
  return map;
}

function toBoolean(raw?: string): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function firstTruthy(values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeTags(tags?: string[] | null): string[] {
  return (tags || []).map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean);
}

function parseNumber(value?: string | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePriceCents(value?: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function toStatus(input?: string | null): "draft" | "active" | "archived" | "db_only" {
  const normalized = (input || "").trim().toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "ARCHIVED") return "archived";
  if (normalized === "DRAFT") return "draft";
  return "draft";
}

function toProductType(tags: string[]): "artwork" | "merch" | "service" {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.includes("service")) return "service";
  if (lower.includes("merch") || lower.includes("merchandise")) return "merch";
  return "artwork";
}

function toOfferings(tags: string[]): "original_only" | "prints_only" | "original_plus_prints" {
  const lower = tags.map((tag) => tag.toLowerCase());
  const hasOriginal = lower.some((tag) => tag === "original" || tag === "unikat");
  const hasPrints = lower.some((tag) => tag === "print" || tag === "prints" || tag === "edition");
  if (hasOriginal && hasPrints) return "original_plus_prints";
  if (hasPrints) return "prints_only";
  return "original_only";
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productFallbackHandle(id: string, title?: string | null): string {
  const slugTitle = title ? slugify(title) : "";
  if (slugTitle) return slugTitle;
  const idPart = id.split("/").pop();
  return idPart ? `product-${idPart}` : "product";
}

function optionValue(
  options: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  matcher: RegExp,
): string | undefined {
  for (const option of options || []) {
    if (!option?.name || !matcher.test(option.name)) continue;
    const value = option.value?.trim();
    if (value) return value;
  }
  return undefined;
}

function artistImportFilter(shopDomain: string, metaobjectGid: string, artistKey: string, existingId?: string) {
  if (existingId) {
    return { _id: existingId };
  }

  return {
    shopDomain,
    $or: [
      { shopifyMetaobjectId: metaobjectGid },
      { "shopify.metaobjectGid": metaobjectGid },
      { artistKey },
    ],
  };
}

function productImportFilter(shopDomain: string, productGid: string, productKey: string, existingId?: string) {
  if (existingId) {
    return { _id: existingId };
  }

  return {
    shopDomain,
    $or: [
      { shopifyProductId: productGid },
      { "shopify.productGid": productGid },
      { productKey },
    ],
  };
}

function variantImportFilter(shopDomain: string, productKey: string, variantGid: string) {
  return {
    shopDomain,
    $or: [
      { shopifyVariantId: variantGid },
      { "shopify.variantGid": variantGid },
      { productKey, variantKey: variantGid },
    ],
  };
}

async function pullArtistsInternal(input: PullInput, mode: PullMode): Promise<PullResult> {
  await connectMongo();

  const shopDomain = resolveShopDomain(input.shopDomain);
  if (!shopDomain) {
    throw new Error("Missing shop domain for artist pull");
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 250);
  const query = `
    query PullArtists($first: Int!, $after: String) {
      metaobjects(type: "${SHOPIFY_METAOBJECT_TYPE_KUENSTLER}", first: $first, after: $after) {
        edges {
          node {
            id
            handle
            fields {
              key
              value
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const data = await callShopifyAdmin<ArtistPageResponse>(query, {
    first: limit,
    after: input.cursor || null,
  });

  const now = new Date();
  const edges = data?.metaobjects?.edges || [];
  const importedMetaobjectIds = edges.map((edge) => edge?.node?.id?.trim()).filter((value): value is string => Boolean(value));
  const existingArtists = importedMetaobjectIds.length
    ? await CanonicalArtistModel.find({
        shopDomain,
        $or: [
          { shopifyMetaobjectId: { $in: importedMetaobjectIds } },
          { "shopify.metaobjectGid": { $in: importedMetaobjectIds } },
          { artistKey: { $in: importedMetaobjectIds } },
        ],
      }).lean()
    : [];
  const existingArtistByMetaobjectId = new Map(
    existingArtists.flatMap((artist) => {
      const keys = [
        artist.shopifyMetaobjectId?.trim(),
        artist.shopify?.metaobjectGid?.trim(),
        artist.artistKey?.trim(),
      ].filter((value): value is string => Boolean(value));
      return keys.map((key) => [key, artist] as const);
    }),
  );
  const ops: Array<Record<string, unknown>> = [];
  let importedCount = 0;

  for (const edge of edges) {
    const node = edge?.node;
    const metaobjectGid = node?.id?.trim();
    if (!metaobjectGid) continue;

    const handle = firstTruthy([node?.handle || undefined]) || `artist-${metaobjectGid.split("/").pop() || "unknown"}`;
    const fieldMap = toFieldMap(node?.fields);
    const displayName = firstTruthy([fieldMap[KUENSTLER_FIELD_KEYS.name], handle]) || handle;
    const galleryUrls = uniq([
      fieldMap[KUENSTLER_FIELD_KEYS.bilder] || "",
      fieldMap[KUENSTLER_FIELD_KEYS.bild_1] || "",
      fieldMap[KUENSTLER_FIELD_KEYS.bild_2] || "",
      fieldMap[KUENSTLER_FIELD_KEYS.bild_3] || "",
    ]);

    const avatarUrl = firstTruthy([fieldMap[KUENSTLER_FIELD_KEYS.bild_1], galleryUrls[0]]);
    const heroUrl = firstTruthy([fieldMap[KUENSTLER_FIELD_KEYS.bilder], galleryUrls[0]]);
    const existingArtist = existingArtistByMetaobjectId.get(metaobjectGid) || null;
    const targetArtistKey = existingArtist?.artistKey || metaobjectGid;

    ops.push({
      updateOne: {
        filter: artistImportFilter(shopDomain, metaobjectGid, targetArtistKey, existingArtist?._id?.toString()),
        update: {
          $set: {
            shopDomain,
            artistKey: targetArtistKey,
            handle: existingArtist?.handle || handle,
            publicSlug: existingArtist?.publicSlug || handle,
            displayName,
            appUrl: fieldMap.app_url || fieldMap.appUrl || undefined,
            instagram: fieldMap[KUENSTLER_FIELD_KEYS.instagram] || undefined,
            shopifyMetaobjectId: metaobjectGid,
            migrationStatus: mode === "import" ? "imported_unlinked" : "linked",
            linkStatus:
              existingArtist?.linkedUserId && mode === "import"
                ? "linked"
                : mode === "import"
                  ? "imported_unlinked"
                  : "linked",
            profileImages: {
              avatarUrl,
              heroUrl,
              galleryUrls,
            },
            consents: {
              allowOriginalSales: toBoolean(fieldMap.allowOriginalSales || fieldMap.allow_original_sales),
              allowPrintSales: toBoolean(fieldMap.allowPrintSales || fieldMap.allow_print_sales),
              allowRental: toBoolean(fieldMap.allowRental || fieldMap.allow_rental),
              allowExhibitions: toBoolean(fieldMap.allowExhibitions || fieldMap.allow_exhibitions),
              presentationOnly: toBoolean(fieldMap.presentationOnly || fieldMap.presentation_only),
            },
            shopify: {
              metaobjectGid,
              lastPulledAt: now,
            },
            sync: {
              dirtyFields: [],
              dirtyAt: null,
              needsPush: false,
              lastPullAt: now,
              lastError: null,
            },
          },
        },
        upsert: true,
      },
    });
    importedCount += 1;
  }

  if (ops.length) {
    await CanonicalArtistModel.bulkWrite(ops as any, { ordered: false });
  }

  const hasNextPage = Boolean(data?.metaobjects?.pageInfo?.hasNextPage);
  const nextCursor = hasNextPage ? data?.metaobjects?.pageInfo?.endCursor || null : null;

  return { importedCount, cursor: nextCursor };
}

export async function pullArtists(input: PullInput): Promise<PullResult> {
  return pullArtistsInternal(input, "sync");
}

export async function importArtistsReadOnly(input: PullInput): Promise<PullResult> {
  return pullArtistsInternal(input, "import");
}

async function pullProductsInternal(input: PullInput, mode: PullMode): Promise<PullResult> {
  await connectMongo();

  const shopDomain = resolveShopDomain(input.shopDomain);
  if (!shopDomain) {
    throw new Error("Missing shop domain for product pull");
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 250);
  const query = `
    query PullProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            description
            descriptionHtml
            vendor
            tags
            status
            featuredImage { url }
            images(first: 20) { nodes { url } }
            artistMetaobject: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
              value
              reference {
                ... on Metaobject {
                  id
                }
              }
            }
            metafieldWidth: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.width}") {
              value
            }
            metafieldHeight: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.height}") {
              value
            }
            metafieldKurzbeschreibung: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.kurzbeschreibung}") {
              value
            }
            variants(first: 100) {
              nodes {
                id
                sku
                price
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
                inventoryItem {
                  id
                  tracked
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const data = await callShopifyAdmin<ProductPageResponse>(query, {
    first: limit,
    after: input.cursor || null,
  });

  const now = new Date();
  const edges = data?.products?.edges || [];
  const importedProductIds = edges.map((edge) => edge?.node?.id?.trim()).filter((value): value is string => Boolean(value));
  const existingProducts = importedProductIds.length
    ? await CanonicalProductModel.find({
        shopDomain,
        $or: [
          { shopifyProductId: { $in: importedProductIds } },
          { "shopify.productGid": { $in: importedProductIds } },
          { productKey: { $in: importedProductIds } },
        ],
      }).lean()
    : [];
  const existingProductByShopifyId = new Map(
    existingProducts.flatMap((product) => {
      const keys = [
        product.shopifyProductId?.trim(),
        product.shopify?.productGid?.trim(),
        product.productKey?.trim(),
      ].filter((value): value is string => Boolean(value));
      return keys.map((key) => [key, product] as const);
    }),
  );
  const productOps: Array<Record<string, unknown>> = [];
  const variantOps: Array<Record<string, unknown>> = [];
  const variantScopes: Array<{ productKey: string; variantKeys: string[] }> = [];
  let importedCount = 0;

  for (const edge of edges) {
    const node = edge?.node;
    const productGid = node?.id?.trim();
    if (!productGid) continue;

    const existingProduct = existingProductByShopifyId.get(productGid) || null;
    const productKey = existingProduct?.productKey || productGid;
    const title = firstTruthy([node?.title || undefined]) || "Untitled";
    const handle = firstTruthy([node?.handle || undefined]) || productFallbackHandle(productGid, title);
    const tags = normalizeTags(node?.tags);
    const imageCandidates = uniq([
      node?.featuredImage?.url || "",
      ...(node?.images?.nodes || []).map((image) => image?.url || ""),
    ]);
    const artistMetaobjectGid = firstTruthy([
      node?.artistMetaobject?.reference?.id || undefined,
      node?.artistMetaobject?.value || undefined,
    ]);

    productOps.push({
      updateOne: {
        filter: productImportFilter(shopDomain, productGid, productKey, existingProduct?._id?.toString()),
        update: {
          $set: {
            shopDomain,
            productKey,
            type: toProductType(tags),
            title,
            handle,
            vendor: node?.vendor || undefined,
            description: node?.description || undefined,
            bodyHtml: node?.descriptionHtml || undefined,
            tags,
            artistRef: artistMetaobjectGid,
            shopifyProductId: productGid,
            migrationStatus: mode === "import" ? "imported_unmapped" : "linked",
            approvalStatus:
              mode === "import"
                ? "needs_review"
                : node?.status === "ARCHIVED"
                  ? "archived"
                  : node?.status === "ACTIVE"
                    ? "published"
                    : "approved",
            images: {
              thumbUrl: imageCandidates[0],
              mediumUrl: imageCandidates[0],
              originalUrl: imageCandidates[0],
              galleryUrls: imageCandidates,
            },
            offerings: toOfferings(tags),
            status: toStatus(node?.status),
            dimensions: {
              widthCm: parseNumber(node?.metafieldWidth?.value),
              heightCm: parseNumber(node?.metafieldHeight?.value),
            },
            shortText: node?.metafieldKurzbeschreibung?.value || undefined,
            shopify: {
              productGid,
              lastPulledAt: now,
            },
            sync: {
              dirtyFields: [],
              dirtyAt: null,
              needsPush: false,
              lastPullAt: now,
              lastError: null,
            },
          },
        },
        upsert: true,
      },
    });

    const variants = node?.variants?.nodes || [];
    const variantKeys: string[] = [];

    for (const variant of variants) {
      const variantGid = variant?.id?.trim();
      if (!variantGid) continue;
      const variantKey = variantGid;
      variantKeys.push(variantKey);

      const selectedOptions = variant.selectedOptions || [];
      const finish = firstTruthy([
        optionValue(selectedOptions, /finish|material|frame/i),
        selectedOptions[0]?.value || undefined,
        "standard",
      ]) || "standard";
      const sizeCode = firstTruthy([
        optionValue(selectedOptions, /size|format|dimension/i),
        selectedOptions[1]?.value || undefined,
        "default",
      ]) || "default";

      const sku = firstTruthy([variant.sku || undefined, `SKU-${variantGid.split("/").pop() || "UNKNOWN"}`]) || "SKU-UNKNOWN";

      variantOps.push({
        updateOne: {
          filter: variantImportFilter(shopDomain, productKey, variantGid),
          update: {
            $set: {
              shopDomain,
              productKey,
              variantKey,
              finish,
              sizeCode,
              sku,
              priceCents: parsePriceCents(variant.price),
              shopifyVariantId: variantGid,
              published: mode === "import" ? false : node?.status === "ACTIVE",
              syncState:
                mode === "import"
                  ? "imported_unmapped"
                  : node?.status === "ARCHIVED"
                    ? "archived"
                    : node?.status === "ACTIVE"
                      ? "published"
                      : "approved",
              inventory: {
                tracked: variant.inventoryItem?.tracked !== false,
                quantity: typeof variant.inventoryQuantity === "number" ? variant.inventoryQuantity : undefined,
              },
              shopify: {
                variantGid,
                inventoryItemGid: variant.inventoryItem?.id || undefined,
              },
            },
          },
          upsert: true,
        },
      });
    }

    variantScopes.push({ productKey, variantKeys });
    importedCount += 1;
  }

  if (productOps.length) {
    await CanonicalProductModel.bulkWrite(productOps as any, { ordered: false });
  }
  if (variantOps.length) {
    await CanonicalVariantModel.bulkWrite(variantOps as any, { ordered: false });
  }

  for (const scope of variantScopes) {
    if (scope.variantKeys.length) {
      await CanonicalVariantModel.deleteMany({
        shopDomain,
        productKey: scope.productKey,
        variantKey: { $nin: scope.variantKeys },
      });
    } else {
      await CanonicalVariantModel.deleteMany({ shopDomain, productKey: scope.productKey });
    }
  }

  const hasNextPage = Boolean(data?.products?.pageInfo?.hasNextPage);
  const nextCursor = hasNextPage ? data?.products?.pageInfo?.endCursor || null : null;

  return { importedCount, cursor: nextCursor };
}

export async function pullProducts(input: PullInput): Promise<PullResult> {
  return pullProductsInternal(input, "sync");
}

export async function importProductsReadOnly(input: PullInput): Promise<PullResult> {
  return pullProductsInternal(input, "import");
}
