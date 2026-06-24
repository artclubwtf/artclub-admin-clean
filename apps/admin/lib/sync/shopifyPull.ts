import { connectMongo } from "@/lib/mongodb";
import {
  PRODUCT_METAFIELD_KEYS,
  SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
  SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
} from "@/lib/shopify";
import { resolveShopDomain } from "@/lib/shopDomain";
import {
  extractShopifyArtistMetaobjectMapping,
  mapShopifyProductToCanonicalArtist,
  resolveShopifyFileField,
  type ShopifyArtistMetaobjectNode as MetaobjectNode,
} from "@/lib/sync/shopifyMapping";
import {
  collectShopifyReferenceGids,
  hydrateArtistMetaobjectWithResolvedReferences,
  resolveShopifyReferenceNodes,
} from "@/lib/sync/shopifyReferenceLookup";
import { normalizeFinishInternalCode, normalizeSizeInternalCode } from "@/lib/sync/shopifyVariantOptionMapping";
import {
  createSyncRunId,
  logArtistImport,
  logProductImport,
  logShopifyPull,
  previewValue,
} from "@/lib/sync/syncLogger";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

type PullInput = {
  shopDomain: string;
  limit?: number;
  cursor?: string | null;
  runId?: string;
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
  legacyResourceId?: string | null;
  title?: string | null;
  handle?: string | null;
  description?: string | null;
  descriptionHtml?: string | null;
  vendor?: string | null;
  tags?: string[] | null;
  status?: string | null;
  featuredImage?: { url?: string | null } | null;
  images?: { nodes?: Array<{ url?: string | null }> | null } | null;
  artistKunstler?: {
    value?: string | null;
    reference?: { id?: string | null; handle?: string | null; displayName?: string | null } | null;
  } | null;
  artistLegacyKuenstler?: { value?: string | null } | null;
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

class ShopifyPullError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ShopifyPullError";
    this.details = details;
  }
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
  let json: ShopifyGraphQLResponse<TData> | null = null;
  try {
    json = JSON.parse(text) as ShopifyGraphQLResponse<TData>;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ShopifyPullError(`Shopify API error ${res.status}`, {
      status: res.status,
      responseBodyPreview: previewValue(text, 300),
      graphqlErrors: json?.errors ?? null,
    });
  }

  if (!json) {
    throw new ShopifyPullError("Shopify returned invalid JSON", {
      responseBodyPreview: previewValue(text, 300),
    });
  }

  if (json.errors) {
    throw new ShopifyPullError("Shopify GraphQL errors", {
      graphqlErrors: json.errors,
    });
  }

  return json.data;
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

async function pullArtistsInternal(input: PullInput, mode: PullMode): Promise<PullResult> {
  await connectMongo();
  const runId = input.runId || createSyncRunId(mode === "import" ? "shopify-import" : "shopify-pull");

  const shopDomain = resolveShopDomain(input.shopDomain);
  if (!shopDomain) {
    throw new Error("Missing shop domain for artist pull");
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 250);
  logArtistImport(
    "artist_metaobject_pull_started",
    {
      shopDomain,
      metaobjectType: SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
      first: limit,
      after: input.cursor || null,
      mode,
    },
    { runId, force: true },
  );

  const query = `
    query PullArtists($first: Int!, $after: String) {
      metaobjects(type: "${SHOPIFY_METAOBJECT_TYPE_KUENSTLER}", first: $first, after: $after) {
        edges {
          node {
            id
            handle
            type
            displayName
            fields {
              key
              value
              type
              reference {
                __typename
                ... on MediaImage {
                  id
                  alt
                  image {
                    url
                    altText
                    width
                    height
                  }
                }
                ... on GenericFile {
                  id
                  url
                }
                ... on Collection {
                  id
                  handle
                }
              }
              references(first: 10) {
                nodes {
                  __typename
                  ... on MediaImage {
                    id
                    image {
                      url
                      altText
                      width
                      height
                    }
                  }
                  ... on GenericFile {
                    id
                    url
                  }
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

  const data = await callShopifyAdmin<ArtistPageResponse>(query, {
    first: limit,
    after: input.cursor || null,
  });

  const now = new Date();
  const edges = data?.metaobjects?.edges || [];
  const referenceLookup = await resolveShopifyReferenceNodes(
    edges.flatMap((edge) => collectShopifyReferenceGids(edge?.node?.fields || [])),
  );
  const ops: Array<Record<string, unknown>> = [];
  const importedMetaobjectIds: string[] = [];
  let importedCount = 0;

  for (const edge of edges) {
    const originalNode = edge?.node;
    const node = originalNode ? hydrateArtistMetaobjectWithResolvedReferences(originalNode, referenceLookup) : null;
    if (!node) continue;
    const metaobjectGid = node?.id?.trim();
    if (!metaobjectGid) continue;
    importedMetaobjectIds.push(metaobjectGid);

    const mapping = extractShopifyArtistMetaobjectMapping(node);
    const fieldKeys = (node?.fields || []).map((field) => field?.key?.trim()).filter(Boolean) as string[];
    const fieldTypes = Object.fromEntries(
      (node?.fields || [])
        .map((field) => [field?.key?.trim(), field?.type?.trim() || null] as const)
        .filter((entry): entry is [string, string | null] => Boolean(entry[0])),
    );
    const hasReferenceByKey = Object.fromEntries(
      (node?.fields || [])
        .map((field) => [field?.key?.trim(), Boolean(field?.reference) || Boolean(field?.references?.nodes?.length)] as const)
        .filter((entry): entry is [string, boolean] => Boolean(entry[0])),
    );

    logArtistImport(
      "artist_metaobject_received",
      {
        metaobjectId: metaobjectGid,
        handle: mapping.handle,
        type: mapping.type || SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
        displayName: mapping.displayName,
        fieldKeys,
        fieldTypes,
        hasReferenceByKey,
      },
      { runId },
    );

    for (const field of node?.fields || []) {
      const fieldKey = field?.key?.trim();
      if (!fieldKey || !["bilder", "bild_1", "bild_2", "bild_3"].includes(fieldKey)) continue;
      const resolved = resolveShopifyFileField(field);
      logShopifyPull(
        "shopify_file_reference_resolve",
        {
          fieldKey: resolved.fieldKey,
          rawValue: resolved.rawValuePreview,
          hasReference: resolved.hasReference,
          referenceTypename: resolved.referenceTypename,
          mediaGid: resolved.mediaGid || resolved.shopifyFileGid || null,
          imageUrlFound: Boolean(resolved.referenceImageUrl),
          imageUrl: resolved.referenceImageUrl,
          genericFileUrlFound: Boolean(resolved.referenceGenericFileUrl),
          reason: resolved.resolvedUrl ? null : resolved.reason,
        },
        { runId },
      );
    }

    for (const fieldCheck of mapping.fieldMappings) {
      logArtistImport(
        "artist_metaobject_field_mapped",
        {
          metaobjectId: metaobjectGid,
          handle: mapping.handle,
          fieldKey: fieldCheck.fieldKey,
          fieldType: fieldCheck.rawType,
          rawValuePreview: fieldCheck.rawValuePreview,
          hasReference: fieldCheck.hasReference,
          referenceTypename: fieldCheck.referenceTypename,
          resolvedUrl: fieldCheck.resolvedUrl,
          mappedTo: fieldCheck.mappedTo,
          success: fieldCheck.success,
          reason: fieldCheck.reason,
        },
        { runId },
      );
      logArtistImport(
        "artist_metaobject_field_mapping_result",
        {
          metaobjectId: metaobjectGid,
          handle: mapping.handle,
          fieldKey: fieldCheck.fieldKey,
          mappedTo: fieldCheck.mappedTo,
          success: fieldCheck.success,
          reason: fieldCheck.reason,
          resolvedUrl: fieldCheck.resolvedUrl,
          mappedValuePreview: fieldCheck.mappedValuePreview,
        },
        { runId },
      );
    }

    ops.push({
      updateOne: {
        filter: { shopDomain, shopifyMetaobjectId: metaobjectGid },
        update: {
          $set: {
            shopDomain,
            artistKey: mapping.handle,
            handle: mapping.handle,
            publicSlug: mapping.handle,
            displayName: mapping.displayName,
            appUrl: mapping.appUrl || undefined,
            instagram: mapping.instagram || undefined,
            quote: mapping.quote || undefined,
            introduction: mapping.introduction || undefined,
            bio: mapping.bio || undefined,
            longText: mapping.longText || undefined,
            categoryRef: mapping.categoryRef || undefined,
            shopifyMetaobjectId: metaobjectGid,
            migrationStatus: mode === "import" ? "imported_unlinked" : "linked",
            linkStatus: mode === "import" ? "imported_unlinked" : "linked",
            profileImages: mapping.profileImages,
            consents: {
              allowOriginalSales: toBoolean((node?.fields || []).find((field) => field?.key === "allowOriginalSales")?.value || (node?.fields || []).find((field) => field?.key === "allow_original_sales")?.value || undefined),
              allowPrintSales: toBoolean((node?.fields || []).find((field) => field?.key === "allowPrintSales")?.value || (node?.fields || []).find((field) => field?.key === "allow_print_sales")?.value || undefined),
              allowRental: toBoolean((node?.fields || []).find((field) => field?.key === "allowRental")?.value || (node?.fields || []).find((field) => field?.key === "allow_rental")?.value || undefined),
              allowExhibitions: toBoolean((node?.fields || []).find((field) => field?.key === "allowExhibitions")?.value || (node?.fields || []).find((field) => field?.key === "allow_exhibitions")?.value || undefined),
              presentationOnly: toBoolean((node?.fields || []).find((field) => field?.key === "presentationOnly")?.value || (node?.fields || []).find((field) => field?.key === "presentation_only")?.value || undefined),
            },
            shopify: {
              metaobjectGid,
              lastPulledAt: now,
            },
            sync: {
              dirtyFields: [],
              dirtyAt: null,
              needsPush: false,
              status: "synced",
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
    const artists = await CanonicalArtistModel.find({
      shopDomain,
      shopifyMetaobjectId: { $in: importedMetaobjectIds },
    })
      .select({
        _id: 1,
        artistKey: 1,
        publicSlug: 1,
        displayName: 1,
        instagram: 1,
        quote: 1,
        introduction: 1,
        longText: 1,
        shopifyMetaobjectId: 1,
        appUrl: 1,
        profileImages: 1,
      })
      .lean();

    for (const artist of artists) {
      logArtistImport(
        "canonical_artist_upserted_from_shopify",
        {
          canonicalArtistId: String(artist._id),
          artistKey: artist.artistKey,
          publicSlug: artist.publicSlug || null,
          displayName: artist.displayName || null,
          hasCoverImage: Boolean(artist.profileImages?.heroUrl),
          galleryImageCount: Array.isArray(artist.profileImages?.galleryUrls) ? artist.profileImages.galleryUrls.length : 0,
          hasInstagram: Boolean(artist.instagram),
          hasQuote: Boolean(artist.quote),
          hasIntro: Boolean(artist.introduction),
          hasLongText: Boolean(artist.longText),
          shopifyMetaobjectId: artist.shopifyMetaobjectId || null,
          appUrl: artist.appUrl || null,
        },
        { runId },
      );
      logArtistImport(
        "canonical_artist_after_import",
        {
          canonicalArtistId: String(artist._id),
          artistKey: artist.artistKey,
          publicSlug: artist.publicSlug || null,
          displayName: artist.displayName || null,
          coverImageUrl: artist.profileImages?.heroUrl || null,
          galleryImageUrls: Array.isArray(artist.profileImages?.galleryUrls) ? artist.profileImages.galleryUrls : [],
          hasInstagram: Boolean(artist.instagram),
          hasQuote: Boolean(artist.quote),
          hasIntro: Boolean(artist.introduction),
          hasLongText: Boolean(artist.longText),
          shopifyMetaobjectId: artist.shopifyMetaobjectId || null,
        },
        { runId },
      );
    }
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
  const runId = input.runId || createSyncRunId(mode === "import" ? "shopify-import" : "shopify-pull");

  const shopDomain = resolveShopDomain(input.shopDomain);
  if (!shopDomain) {
    throw new Error("Missing shop domain for product pull");
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 250);
  logProductImport(
    "product_pull_started",
    {
      shopDomain,
      first: limit,
      after: input.cursor || null,
      mode,
    },
    { runId, force: true },
  );

  const query = `
    query PullProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            legacyResourceId
            title
            handle
            description
            descriptionHtml
            vendor
            tags
            status
            featuredImage { url }
            images(first: 20) { nodes { url } }
            artistKunstler: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
              value
              reference {
                ... on Metaobject {
                  id
                  handle
                  displayName
                }
              }
            }
            artistLegacyKuenstler: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistLegacyUrl}") {
              value
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
  const productOps: Array<Record<string, unknown>> = [];
  const variantOps: Array<Record<string, unknown>> = [];
  const variantScopes: Array<{ productKey: string; variantKeys: string[] }> = [];
  const importedProductKeys: string[] = [];
  const productVariantLogs: Array<{
    productKey: string;
    productId: string;
    variants: Array<{ variantId: string; sku: string; title: string; finish: string; size: string; price: string | null | undefined }>;
  }> = [];
  let importedCount = 0;

  for (const edge of edges) {
    const node = edge?.node;
    const productGid = node?.id?.trim();
    if (!productGid) continue;

    const title = firstTruthy([node?.title || undefined]) || "Untitled";
    const handle = firstTruthy([node?.handle || undefined]) || productFallbackHandle(productGid, title);
    const productKey = handle;
    importedProductKeys.push(productKey);
    const tags = normalizeTags(node?.tags);
    const imageCandidates = uniq([
      node?.featuredImage?.url || "",
      ...(node?.images?.nodes || []).map((image) => image?.url || ""),
    ]);
    const customKunstlerValue = firstTruthy([node?.artistKunstler?.reference?.id || undefined, node?.artistKunstler?.value || undefined]) || null;
    const customKuenstlerValue = node?.artistLegacyKuenstler?.value?.trim() || null;
    const lookup = await mapShopifyProductToCanonicalArtist({
      shopDomain,
      customKunstlerValue,
      customKuenstlerValue,
      customKunstlerHandle: node?.artistKunstler?.reference?.handle || null,
      customKunstlerDisplayName: node?.artistKunstler?.reference?.displayName || null,
    });
    const matchedArtist = lookup.selectedArtist;
    const artistMetaobjectGid = matchedArtist?.shopifyMetaobjectId || matchedArtist?.shopify?.metaobjectGid || undefined;
    const assignmentStatus = matchedArtist ? "confirmed" : lookup.selectedInputValue ? "needs_review" : "unassigned";
    const metafieldKeys = [
      customKunstlerValue ? `${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.artistMetaobject}` : null,
      customKuenstlerValue ? `${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.artistLegacyUrl}` : null,
      node?.metafieldWidth?.value ? `${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.width}` : null,
      node?.metafieldHeight?.value ? `${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.height}` : null,
      node?.metafieldKurzbeschreibung?.value ? `${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.kurzbeschreibung}` : null,
    ].filter(Boolean);

    logProductImport(
      "shopify_product_received",
      {
        productId: productGid,
        legacyResourceId: node?.legacyResourceId || null,
        handle,
        title,
        status: node?.status || null,
        vendor: node?.vendor || null,
        imageCount: imageCandidates.length,
        variantCount: (node?.variants?.nodes || []).length,
        metafieldKeys,
        hasCustomKunstler: Boolean(customKunstlerValue),
        customKunstlerValue,
        hasCustomKuenstler: Boolean(customKuenstlerValue),
        customKuenstlerValue,
      },
      { runId },
    );

    logProductImport(
      "product_artist_mapping_attempt",
      {
        productId: productGid,
        handle,
        title,
        vendor: node?.vendor || null,
        customKunstlerValue,
        customKuenstlerValue,
        lookupCandidates: lookup.lookupCandidates,
        selectedCanonicalArtistId: lookup.selectedArtistId || null,
        selectedArtistName: lookup.selectedArtistName || null,
        success: Boolean(matchedArtist),
        reason: lookup.reason,
      },
      { runId },
    );

    productOps.push({
      updateOne: {
        filter: { shopDomain, shopifyProductId: productGid },
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
            descriptionHtml: node?.descriptionHtml || undefined,
            tags,
            ...(matchedArtist ? { canonicalArtistId: matchedArtist._id, artistKey: matchedArtist.artistKey } : {}),
            artistRef: artistMetaobjectGid,
            artistSlug: lookup.selectedInputValue || undefined,
            shopifyProductId: productGid,
            assignmentStatus,
            migrationStatus: matchedArtist ? "linked" : mode === "import" ? "imported_unmapped" : "needs_review",
            approvalStatus:
              mode === "import"
                ? matchedArtist
                  ? "approved"
                  : "needs_review"
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
            shortDescription: node?.metafieldKurzbeschreibung?.value || undefined,
            shopify: {
              productGid,
              lastPulledAt: now,
            },
            sync: {
              dirtyFields: [],
              dirtyAt: null,
              needsPush: false,
              status: "synced",
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
    const variantLogRows: Array<{
      variantId: string;
      sku: string;
      title: string;
      finish: string;
      size: string;
      price: string | null | undefined;
    }> = [];

    for (const variant of variants) {
      const variantGid = variant?.id?.trim();
      if (!variantGid) continue;
      const variantKey = variantGid;
      variantKeys.push(variantKey);

      const selectedOptions = variant.selectedOptions || [];
      const finishRaw = firstTruthy([
        optionValue(selectedOptions, /finish|material|frame/i),
        selectedOptions[0]?.value || undefined,
        "standard",
      ]) || "standard";
      const sizeRaw = firstTruthy([
        optionValue(selectedOptions, /size|format|dimension/i),
        selectedOptions[1]?.value || undefined,
        "default",
      ]) || "default";
      const finish = normalizeFinishInternalCode(finishRaw) || "standard";
      const sizeCode = normalizeSizeInternalCode(sizeRaw) || "default";

      const sku = firstTruthy([variant.sku || undefined, `SKU-${variantGid.split("/").pop() || "UNKNOWN"}`]) || "SKU-UNKNOWN";
      variantLogRows.push({
        variantId: variantGid,
        sku,
        title: `${finishRaw} / ${sizeRaw}`,
        finish,
        size: sizeCode,
        price: variant?.price,
      });

      variantOps.push({
        updateOne: {
          filter: { shopDomain, productKey, variantKey },
          update: {
            $set: {
              shopDomain,
              productKey,
              variantKey,
              ...(matchedArtist ? { canonicalArtistId: matchedArtist._id } : {}),
              finish,
              sizeCode,
              size: sizeCode,
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

    productVariantLogs.push({ productKey, productId: productGid, variants: variantLogRows });
    variantScopes.push({ productKey, variantKeys });
    importedCount += 1;
  }

  if (productOps.length) {
    await CanonicalProductModel.bulkWrite(productOps as any, { ordered: false });
  }
  if (variantOps.length) {
    await CanonicalVariantModel.bulkWrite(variantOps as any, { ordered: false });
  }

  const importedVariantProductKeys = variantScopes.map((scope) => scope.productKey);
  if (importedVariantProductKeys.length) {
    const products = await CanonicalProductModel.find({ shopDomain, productKey: { $in: importedProductKeys } })
      .select({ _id: 1, productKey: 1, canonicalArtistId: 1 })
      .lean();
    await Promise.all(
      products.map((product) =>
        CanonicalVariantModel.updateMany(
          { shopDomain, productKey: product.productKey },
          {
            $set: {
              canonicalProductId: product._id,
              ...(product.canonicalArtistId ? { canonicalArtistId: product.canonicalArtistId } : {}),
            },
          },
        ),
      ),
    );
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

  if (importedProductKeys.length) {
    const [products, variants] = await Promise.all([
      CanonicalProductModel.find({ shopDomain, productKey: { $in: importedProductKeys } })
        .select({
          _id: 1,
          productKey: 1,
          title: 1,
          canonicalArtistId: 1,
          assignmentStatus: 1,
          images: 1,
          shopifyProductId: 1,
          shopify: 1,
          status: 1,
        })
        .lean(),
      CanonicalVariantModel.find({ shopDomain, productKey: { $in: importedProductKeys } })
        .select({ _id: 1, productKey: 1, variantKey: 1, sku: 1, finish: 1, sizeCode: 1, priceCents: 1, shopifyVariantId: 1 })
        .lean(),
    ]);

    const variantsByProduct = variants.reduce<Record<string, typeof variants>>((acc, variant) => {
      if (!acc[variant.productKey]) acc[variant.productKey] = [];
      acc[variant.productKey].push(variant);
      return acc;
    }, {});

    for (const product of products) {
      logProductImport(
        "canonical_product_upserted_from_shopify",
        {
          canonicalProductId: String(product._id),
          productKey: product.productKey,
          title: product.title,
          canonicalArtistId: product.canonicalArtistId ? String(product.canonicalArtistId) : null,
          assignmentStatus: product.assignmentStatus || null,
          imageCount: Array.isArray(product.images?.galleryUrls) ? product.images.galleryUrls.length : 0,
          variantCount: (variantsByProduct[product.productKey] || []).length,
          shopifyProductId: product.shopifyProductId || null,
          productGid: product.shopify?.productGid || product.shopifyProductId || null,
          status: product.status,
        },
        { runId },
      );
    }

    for (const entry of productVariantLogs) {
      const variantDocs = variantsByProduct[entry.productKey] || [];
      const variantByGid = new Map(variantDocs.map((variant) => [variant.shopifyVariantId || variant.variantKey, variant]));
      const product = products.find((item) => item.productKey === entry.productKey);
      logProductImport(
        "shopify_variants_imported",
        {
          productId: entry.productId,
          canonicalProductId: product ? String(product._id) : null,
          variantCount: variantDocs.length,
          variants: entry.variants.map((variant) => {
            const mapped = variantByGid.get(variant.variantId);
            return {
              variantId: variant.variantId,
              sku: variant.sku,
              title: variant.title,
              finish: variant.finish,
              size: variant.size,
              price: variant.price,
              mappedCanonicalVariantId: mapped ? String(mapped._id) : null,
              createdOrUpdated: Boolean(mapped),
            };
          }),
        },
        { runId },
      );
    }
  }

  return { importedCount, cursor: nextCursor };
}

export async function pullProducts(input: PullInput): Promise<PullResult> {
  return pullProductsInternal(input, "sync");
}

export async function importProductsReadOnly(input: PullInput): Promise<PullResult> {
  return pullProductsInternal(input, "import");
}
