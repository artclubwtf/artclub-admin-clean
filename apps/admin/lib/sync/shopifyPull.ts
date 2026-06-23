import { connectMongo } from "@/lib/mongodb";
import {
  KUENSTLER_FIELD_KEYS,
  PRODUCT_METAFIELD_KEYS,
  SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
  SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
} from "@/lib/shopify";
import { resolveShopDomain } from "@/lib/shopDomain";
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

type MetaobjectNode = {
  id?: string | null;
  handle?: string | null;
  type?: string | null;
  displayName?: string | null;
  fields?: Array<{
    key?: string | null;
    value?: string | null;
    type?: string | null;
    reference?: ShopifyFieldReference | null;
  }> | null;
};

type ShopifyFieldReference = {
  __typename?: string | null;
  id?: string | null;
  alt?: string | null;
  url?: string | null;
  handle?: string | null;
  image?: {
    url?: string | null;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
};

type ResolvedMediaField = {
  fieldKey: string;
  url: string;
  altText?: string;
  shopifyFileGid?: string;
  mediaGid?: string;
  width?: number;
  height?: number;
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
    reference?: { id?: string | null } | null;
  } | null;
  artistLegacyKuenstler?: { value?: string | null } | null;
  metafieldWidth?: { value?: string | null } | null;
  metafieldHeight?: { value?: string | null } | null;
  metafieldKurzbeschreibung?: { value?: string | null } | null;
  variants?: { nodes?: ProductVariantNode[] | null } | null;
};

type CanonicalArtistLookup = {
  selectedArtist:
    | {
        _id: unknown;
        artistKey: string;
        publicSlug?: string | null;
        handle?: string | null;
        displayName?: string | null;
        shopifyMetaobjectId?: string | null;
        shopify?: { metaobjectGid?: string | null } | null;
      }
    | null;
  selectedArtistId?: string;
  selectedArtistName?: string;
  reason: string;
  lookupCandidates: {
    publicSlug: string[];
    handle: string[];
    artistKey: string[];
    shopifyMetaobject: string[];
  };
  selectedInputValue?: string;
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

function resolveMediaField(
  field: { key?: string | null; value?: string | null; reference?: ShopifyFieldReference | null },
  options?: { runId?: string },
): ResolvedMediaField | null {
  const fieldKey = field.key?.trim();
  if (!fieldKey) return null;

  const reference = field.reference;
  const image = reference?.image;
  const url = firstTruthy([image?.url || undefined, reference?.url || undefined]);
  const hasReference = Boolean(reference);

  logShopifyPull(
    "shopify_file_reference_resolve",
    {
      fieldKey,
      rawValue: previewValue(field.value, 120),
      hasReference,
      referenceTypename: reference?.__typename || null,
      mediaGid: reference?.id || field.value || null,
      imageUrlFound: Boolean(image?.url),
      imageUrl: image?.url || null,
      genericFileUrlFound: Boolean(reference?.url),
      reason: url ? null : hasReference ? "reference_without_url" : field.value ? "field_value_gid_without_reference" : "empty_field",
    },
    { runId: options?.runId },
  );

  if (!url) return null;

  return {
    fieldKey,
    url,
    altText: image?.altText || reference?.alt || undefined,
    shopifyFileGid: reference?.id || field.value || undefined,
    mediaGid: reference?.id || undefined,
    width: typeof image?.width === "number" ? image.width : undefined,
    height: typeof image?.height === "number" ? image.height : undefined,
  };
}

function mediaByField(fields?: MetaobjectNode["fields"], options?: { runId?: string }): Record<string, ResolvedMediaField> {
  const map: Record<string, ResolvedMediaField> = {};
  for (const field of fields || []) {
    const media = resolveMediaField(field || {}, options);
    if (media) map[media.fieldKey] = media;
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RELEVANT_ARTIST_FIELD_KEYS = new Set<string>([
  KUENSTLER_FIELD_KEYS.app_url,
  KUENSTLER_FIELD_KEYS.bilder,
  KUENSTLER_FIELD_KEYS.bild_1,
  KUENSTLER_FIELD_KEYS.bild_2,
  KUENSTLER_FIELD_KEYS.bild_3,
  KUENSTLER_FIELD_KEYS.instagram,
  KUENSTLER_FIELD_KEYS.name,
  KUENSTLER_FIELD_KEYS.quote,
  KUENSTLER_FIELD_KEYS.einleitung_1,
  KUENSTLER_FIELD_KEYS.text_1,
  KUENSTLER_FIELD_KEYS.kategorie,
]);

async function resolveCanonicalArtistForShopifyProduct(input: {
  shopDomain: string;
  customKunstlerValue?: string | null;
  customKuenstlerValue?: string | null;
}): Promise<CanonicalArtistLookup> {
  const customKunstlerValue = input.customKunstlerValue?.trim();
  const customKuenstlerValue = input.customKuenstlerValue?.trim();
  const value = customKunstlerValue || customKuenstlerValue;
  if (!value) {
    return {
      selectedArtist: null,
      reason: customKuenstlerValue === "" ? "custom_kuenstler_empty" : "no_custom_kunstler",
      lookupCandidates: { publicSlug: [], handle: [], artistKey: [], shopifyMetaobject: [] },
    };
  }

  const exact = new RegExp(`^${escapeRegex(value)}$`, "i");
  const matches = await CanonicalArtistModel.find({
    shopDomain: input.shopDomain,
    $or: [
      { publicSlug: exact },
      { handle: exact },
      { artistKey: exact },
      { shopifyMetaobjectId: value },
      { "shopify.metaobjectGid": value },
    ],
  })
    .select({ _id: 1, artistKey: 1, publicSlug: 1, handle: 1, displayName: 1, shopifyMetaobjectId: 1, shopify: 1 })
    .limit(20)
    .lean();

  const publicSlugMatches = matches
    .filter((artist) => artist.publicSlug && exact.test(artist.publicSlug))
    .map((artist) => artist.publicSlug!.trim());
  const handleMatches = matches.filter((artist) => artist.handle && exact.test(artist.handle)).map((artist) => artist.handle!.trim());
  const artistKeyMatches = matches
    .filter((artist) => artist.artistKey && exact.test(artist.artistKey))
    .map((artist) => artist.artistKey.trim());
  const metaobjectMatches = matches
    .filter((artist) => artist.shopifyMetaobjectId === value || artist.shopify?.metaobjectGid === value)
    .map((artist) => artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid || "")
    .filter(Boolean);

  if (matches.length === 0) {
    return {
      selectedArtist: null,
      reason: "no_matching_artist",
      lookupCandidates: {
        publicSlug: publicSlugMatches,
        handle: handleMatches,
        artistKey: artistKeyMatches,
        shopifyMetaobject: metaobjectMatches,
      },
      selectedInputValue: value,
    };
  }

  if (matches.length > 1) {
    return {
      selectedArtist: null,
      reason: "ambiguous_match",
      lookupCandidates: {
        publicSlug: publicSlugMatches,
        handle: handleMatches,
        artistKey: artistKeyMatches,
        shopifyMetaobject: metaobjectMatches,
      },
      selectedInputValue: value,
    };
  }

  const selectedArtist = matches[0];
  let reason = "matched_custom_kunstler_handle";
  if (selectedArtist.publicSlug && exact.test(selectedArtist.publicSlug)) {
    reason = "matched_custom_kunstler_publicSlug";
  } else if (selectedArtist.artistKey && exact.test(selectedArtist.artistKey)) {
    reason = "matched_custom_kunstler_artistKey";
  } else if (selectedArtist.shopifyMetaobjectId === value || selectedArtist.shopify?.metaobjectGid === value) {
    reason = "matched_custom_kunstler_shopify_metaobject";
  }

  return {
    selectedArtist,
    selectedArtistId: String(selectedArtist._id),
    selectedArtistName: selectedArtist.displayName || selectedArtist.artistKey,
    reason,
    lookupCandidates: {
      publicSlug: publicSlugMatches,
      handle: handleMatches,
      artistKey: artistKeyMatches,
      shopifyMetaobject: metaobjectMatches,
    },
    selectedInputValue: value,
  };
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
  const ops: Array<Record<string, unknown>> = [];
  const importedMetaobjectIds: string[] = [];
  let importedCount = 0;

  for (const edge of edges) {
    const node = edge?.node;
    const metaobjectGid = node?.id?.trim();
    if (!metaobjectGid) continue;
    importedMetaobjectIds.push(metaobjectGid);

    const handle = firstTruthy([node?.handle || undefined]) || `artist-${metaobjectGid.split("/").pop() || "unknown"}`;
    const fieldMap = toFieldMap(node?.fields);
    const mediaMap = mediaByField(node?.fields, { runId });
    const displayName = firstTruthy([fieldMap[KUENSTLER_FIELD_KEYS.name], node?.displayName || undefined, handle]) || handle;
    const galleryUrls = uniq([
      mediaMap[KUENSTLER_FIELD_KEYS.bild_1]?.url || fieldMap[KUENSTLER_FIELD_KEYS.bild_1] || "",
      mediaMap[KUENSTLER_FIELD_KEYS.bild_2]?.url || fieldMap[KUENSTLER_FIELD_KEYS.bild_2] || "",
      mediaMap[KUENSTLER_FIELD_KEYS.bild_3]?.url || fieldMap[KUENSTLER_FIELD_KEYS.bild_3] || "",
    ]);

    const avatarUrl = firstTruthy([mediaMap[KUENSTLER_FIELD_KEYS.bild_1]?.url, fieldMap[KUENSTLER_FIELD_KEYS.bild_1], galleryUrls[0]]);
    const heroUrl = firstTruthy([mediaMap[KUENSTLER_FIELD_KEYS.bilder]?.url, fieldMap[KUENSTLER_FIELD_KEYS.bilder], galleryUrls[0]]);
    const introduction = firstTruthy([fieldMap[KUENSTLER_FIELD_KEYS.einleitung_1], fieldMap[KUENSTLER_FIELD_KEYS.text_1]]);
    const fieldKeys = (node?.fields || []).map((field) => field?.key?.trim()).filter(Boolean) as string[];
    const fieldTypes = Object.fromEntries(
      (node?.fields || [])
        .map((field) => [field?.key?.trim(), field?.type?.trim() || null] as const)
        .filter((entry): entry is [string, string | null] => Boolean(entry[0])),
    );
    const hasReferenceByKey = Object.fromEntries(
      (node?.fields || [])
        .map((field) => [field?.key?.trim(), Boolean(field?.reference)] as const)
        .filter((entry): entry is [string, boolean] => Boolean(entry[0])),
    );

    logArtistImport(
      "artist_metaobject_received",
      {
        metaobjectId: metaobjectGid,
        handle,
        type: node?.type || SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
        displayName,
        fieldKeys,
        fieldTypes,
        hasReferenceByKey,
      },
      { runId },
    );

    for (const field of node?.fields || []) {
      const fieldKey = field?.key?.trim();
      if (!fieldKey || !RELEVANT_ARTIST_FIELD_KEYS.has(fieldKey)) continue;

      const mappedTo =
        fieldKey === KUENSTLER_FIELD_KEYS.app_url
          ? "appUrl"
          : fieldKey === KUENSTLER_FIELD_KEYS.bilder
            ? "profileImages.heroUrl"
            : fieldKey === KUENSTLER_FIELD_KEYS.bild_1
              ? "profileImages.avatarUrl"
              : fieldKey === KUENSTLER_FIELD_KEYS.bild_2
                ? "profileImages.galleryUrls[1]"
                : fieldKey === KUENSTLER_FIELD_KEYS.bild_3
                  ? "profileImages.galleryUrls[2]"
                  : fieldKey === KUENSTLER_FIELD_KEYS.instagram
                    ? "instagram"
                    : fieldKey === KUENSTLER_FIELD_KEYS.name
                      ? "displayName"
                      : fieldKey === KUENSTLER_FIELD_KEYS.quote
                        ? "quote"
                        : fieldKey === KUENSTLER_FIELD_KEYS.einleitung_1
                          ? "introduction"
                          : fieldKey === KUENSTLER_FIELD_KEYS.text_1
                            ? "longText"
                            : "categoryRef";
      const mappedValue =
        fieldKey === KUENSTLER_FIELD_KEYS.app_url
          ? fieldMap.app_url || fieldMap.appUrl
          : fieldKey === KUENSTLER_FIELD_KEYS.bilder
            ? heroUrl
            : fieldKey === KUENSTLER_FIELD_KEYS.bild_1
              ? avatarUrl
              : fieldKey === KUENSTLER_FIELD_KEYS.bild_2
                ? galleryUrls[1]
                : fieldKey === KUENSTLER_FIELD_KEYS.bild_3
                  ? galleryUrls[2]
                  : fieldKey === KUENSTLER_FIELD_KEYS.instagram
                    ? fieldMap[KUENSTLER_FIELD_KEYS.instagram]
                    : fieldKey === KUENSTLER_FIELD_KEYS.name
                      ? displayName
                      : fieldKey === KUENSTLER_FIELD_KEYS.quote
                        ? fieldMap[KUENSTLER_FIELD_KEYS.quote]
                        : fieldKey === KUENSTLER_FIELD_KEYS.einleitung_1
                          ? fieldMap[KUENSTLER_FIELD_KEYS.einleitung_1]
                          : fieldKey === KUENSTLER_FIELD_KEYS.text_1
                            ? fieldMap[KUENSTLER_FIELD_KEYS.text_1]
                            : fieldMap[KUENSTLER_FIELD_KEYS.kategorie];

      logArtistImport(
        "artist_metaobject_field_mapped",
        {
          metaobjectId: metaobjectGid,
          handle,
          fieldKey,
          fieldType: field?.type || null,
          rawValuePreview: previewValue(field?.value, 120),
          hasReference: Boolean(field?.reference),
          referenceTypename: field?.reference?.__typename || null,
          resolvedUrl: mediaMap[fieldKey]?.url || null,
          mappedTo,
          success: Boolean(mappedValue),
          reason: mappedValue ? null : field?.value ? "mapped_value_empty" : "empty_source_value",
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
            artistKey: handle,
            handle,
            publicSlug: handle,
            displayName,
            appUrl: fieldMap.app_url || fieldMap.appUrl || undefined,
            instagram: fieldMap[KUENSTLER_FIELD_KEYS.instagram] || undefined,
            quote: fieldMap[KUENSTLER_FIELD_KEYS.quote] || undefined,
            introduction: fieldMap[KUENSTLER_FIELD_KEYS.einleitung_1] || undefined,
            bio: introduction || undefined,
            longText: fieldMap[KUENSTLER_FIELD_KEYS.text_1] || undefined,
            categoryRef: fieldMap[KUENSTLER_FIELD_KEYS.kategorie] || undefined,
            shopifyMetaobjectId: metaobjectGid,
            migrationStatus: mode === "import" ? "imported_unlinked" : "linked",
            linkStatus: mode === "import" ? "imported_unlinked" : "linked",
            profileImages: {
              avatarUrl,
              heroUrl,
              galleryUrls,
              media: [
                mediaMap[KUENSTLER_FIELD_KEYS.bilder],
                mediaMap[KUENSTLER_FIELD_KEYS.bild_1],
                mediaMap[KUENSTLER_FIELD_KEYS.bild_2],
                mediaMap[KUENSTLER_FIELD_KEYS.bild_3],
              ].filter(Boolean),
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
    const customKunstlerValue = firstTruthy([node?.artistKunstler?.value || undefined, node?.artistKunstler?.reference?.id || undefined]) || null;
    const customKuenstlerValue = node?.artistLegacyKuenstler?.value?.trim() || null;
    const lookup = await resolveCanonicalArtistForShopifyProduct({
      shopDomain,
      customKunstlerValue,
      customKuenstlerValue,
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
      variantLogRows.push({
        variantId: variantGid,
        sku,
        title: `${finish} / ${sizeCode}`,
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
