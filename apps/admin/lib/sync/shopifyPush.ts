import { buildProductMetafieldsForArtwork, upsertArtistMetaobject } from "../shopify";
import { getArtistShopifySyncMode } from "../artistShopifySyncMode";
import { assertShopifyWriteEnabled } from "../featureFlags";
import { connectMongo } from "../mongodb";
import {
  createSyncRunId,
  logShopifyPush,
  logSyncError,
  previewValue,
} from "./syncLogger";
import { CanonicalArtistModel } from "../../models/CanonicalArtist";
import { ArtistMediaV2Model } from "../../models/ArtistMediaV2";
import { CanonicalProductModel, type CanonicalProduct } from "../../models/CanonicalProduct";
import { CanonicalVariantModel } from "../../models/CanonicalVariant";

type PushInput = {
  shopDomain: string;
  limit?: number;
  artistKeys?: string[];
  productKeys?: string[];
  dryRun?: boolean;
  approvedOnly?: boolean;
  runId?: string;
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

type PushableProduct = CanonicalProduct & {
  artistSlugForShopify?: string;
  artistMetaobjectGidForShopify?: string;
};

type ProductImageResolutionInput = {
  _id: unknown;
  artistKey?: string | null;
  images?: CanonicalProduct["images"] | null;
  productKey: string;
  shopDomain: string;
};

type ProductArtistResolutionInput = {
  _id: unknown;
  artistKey?: string | null;
  canonicalArtistId?: CanonicalProduct["canonicalArtistId"] | null;
  productKey: string;
  shopDomain: string;
};

type ArtistSummary = {
  id?: string;
  displayName?: string;
  publicSlug?: string;
  handle?: string;
  artistKey?: string;
  appUrl?: string;
  shopifyMetaobjectId?: string;
  shopifyMetaobjectGid?: string;
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizeShopStatus(status: CanonicalProduct["status"]): "DRAFT" | "ACTIVE" | "ARCHIVED" {
  if (status === "active" || status === "approved" || status === "shopify_pending" || status === "shopify_synced") return "ACTIVE";
  if (status === "archived") return "ARCHIVED";
  return "DRAFT";
}

function normalizePrice(priceCents: number): string {
  return (Math.max(0, Number.isFinite(priceCents) ? priceCents : 0) / 100).toFixed(2);
}

function isHttpUrl(value?: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

function isShopifyGid(value?: string | null) {
  return Boolean(value && value.trim().startsWith("gid://shopify/"));
}

function parseArtistMediaIdFromUrl(value?: string | null) {
  if (!value) return null;
  const match = value.match(/\/api\/(?:artist\/media|public\/artist-media)\/([a-fA-F0-9]{24})(?:\/file)?(?:[/?#]|$)/);
  return match?.[1] || null;
}

function uniqStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

async function resolvePushableProductImageUrls(
  product: ProductImageResolutionInput,
  runId: string,
) {
  const rawCandidates = uniqStrings([
    product.images?.originalUrl,
    product.images?.mediumUrl,
    product.images?.thumbUrl,
    ...(Array.isArray(product.images?.galleryUrls) ? product.images.galleryUrls : []),
  ]);
  const directUrls: string[] = [];
  const artistMediaIds: string[] = [];

  for (const rawValue of rawCandidates) {
    if (isHttpUrl(rawValue)) {
      directUrls.push(rawValue);
      continue;
    }

    if (isShopifyGid(rawValue)) {
      logShopifyPush(
        "product_image_not_pushable",
        {
          canonicalProductId: String(product._id),
          productKey: product.productKey,
          rawValue,
          reason: "gid_without_url",
        },
        { runId, force: true },
      );
      continue;
    }

    const artistMediaId = parseArtistMediaIdFromUrl(rawValue);
    if (artistMediaId) {
      artistMediaIds.push(artistMediaId);
      continue;
    }

    logShopifyPush(
      "product_image_not_pushable",
      {
        canonicalProductId: String(product._id),
        productKey: product.productKey,
        rawValue,
        reason: rawValue ? "unsupported_source" : "missing_url",
      },
      { runId, force: true },
    );
  }

  if (artistMediaIds.length) {
    const media = await ArtistMediaV2Model.find({
      _id: { $in: artistMediaIds },
      shopDomain: product.shopDomain,
      ...(product.artistKey ? { artistKey: product.artistKey } : {}),
    })
      .select({ _id: 1, url: 1, previewUrl: 1 })
      .lean();
    const mediaById = new Map(media.map((item) => [String(item._id), item]));

    for (const artistMediaId of uniqStrings(artistMediaIds)) {
      const item = mediaById.get(artistMediaId);
      if (!item) {
        logShopifyPush(
          "product_image_not_pushable",
          {
            canonicalProductId: String(product._id),
            productKey: product.productKey,
            artistMediaId,
            reason: "artist_media_not_found",
          },
          { runId, force: true },
        );
        continue;
      }

      const resolvedUrl = uniqStrings([item.url, item.previewUrl]).find((value) => isHttpUrl(value)) || "";
      if (!resolvedUrl) {
        logShopifyPush(
          "product_image_not_pushable",
          {
            canonicalProductId: String(product._id),
            productKey: product.productKey,
            artistMediaId,
            reason: "missing_url",
          },
          { runId, force: true },
        );
        continue;
      }
      directUrls.push(resolvedUrl);
    }
  }

  return uniqStrings(directUrls);
}

async function resolveArtistSlugForProduct(product: CanonicalProduct) {
  if (product.artistSlug?.trim()) return product.artistSlug.trim();
  if (product.canonicalArtistId) {
    const artist = await CanonicalArtistModel.findById(product.canonicalArtistId)
      .select({ publicSlug: 1, handle: 1, artistKey: 1 })
      .lean();
    const slug = artist?.publicSlug || artist?.handle || artist?.artistKey;
    if (slug?.trim()) return slug.trim();
  }
  return product.artistKey?.trim() || undefined;
}

async function findShopifyArtistMetaobjectByHandles(handles: Array<string | null | undefined>) {
  const candidates = uniqStrings(handles);
  for (const handle of candidates) {
    const data = await callShopifyAdmin<{
      metaobjectByHandle?: {
        id?: string | null;
        handle?: string | null;
      } | null;
    }>(
      `
        query FindArtistMetaobjectByHandle($handle: String!) {
          metaobjectByHandle(handle: { type: "kunstler", handle: $handle }) {
            id
            handle
          }
        }
      `,
      { handle },
    );
    const metaobject = data?.metaobjectByHandle;
    if (metaobject?.id) {
      return {
        id: metaobject.id,
        handle: metaobject.handle?.trim() || handle,
      };
    }
  }
  return null;
}

async function ensureArtistMetaobjectGidForProduct(
  product: ProductArtistResolutionInput,
  artistSummary: ArtistSummary | null,
  runId: string,
) {
  const artistSlug = artistSummary?.publicSlug || artistSummary?.handle || artistSummary?.artistKey || product.artistKey || undefined;
  const existingGid = artistSummary?.shopifyMetaobjectGid || artistSummary?.shopifyMetaobjectId || "";
  if (existingGid.trim()) {
    return { artistMetaobjectGid: existingGid.trim(), artistSlug };
  }

  const matchedMetaobject = await findShopifyArtistMetaobjectByHandles([
    artistSummary?.publicSlug,
    artistSummary?.handle,
    artistSummary?.artistKey,
    product.artistKey,
  ]);
  if (matchedMetaobject?.id && product.canonicalArtistId) {
    await CanonicalArtistModel.updateOne(
      { _id: product.canonicalArtistId },
      {
        $set: {
          shopifyMetaobjectId: matchedMetaobject.id,
          "shopify.metaobjectGid": matchedMetaobject.id,
        },
      },
    );
    return { artistMetaobjectGid: matchedMetaobject.id, artistSlug: artistSlug || matchedMetaobject.handle || undefined };
  }

  const artistKey = artistSummary?.artistKey || product.artistKey;
  if (!artistKey) {
    return { artistMetaobjectGid: null, artistSlug };
  }

  const pushResult = await pushOneArtist({ shopDomain: product.shopDomain, artistKey, runId });
  const failedItem = pushResult.items.find((item) => item.status === "error");
  if (failedItem) {
    throw new Error(failedItem.message || "Failed to create Shopify artist metaobject");
  }

  const refreshedArtist = await CanonicalArtistModel.findOne(
    product.canonicalArtistId ? { _id: product.canonicalArtistId } : { shopDomain: product.shopDomain, artistKey },
  )
    .select({ publicSlug: 1, handle: 1, artistKey: 1, shopifyMetaobjectId: 1, shopify: 1 })
    .lean();
  const resolvedGid = refreshedArtist?.shopify?.metaobjectGid || refreshedArtist?.shopifyMetaobjectId || "";
  if (!resolvedGid.trim()) {
    throw new Error(`Missing Shopify artist metaobject for product ${product.productKey}`);
  }

  return {
    artistMetaobjectGid: resolvedGid.trim(),
    artistSlug: refreshedArtist?.publicSlug || refreshedArtist?.handle || refreshedArtist?.artistKey || artistSlug || undefined,
  };
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

class ShopifyPushError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ShopifyPushError";
    this.details = details;
  }
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
  let json: { data?: TData; errors?: unknown } | null = null;
  try {
    json = JSON.parse(text) as { data?: TData; errors?: unknown };
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ShopifyPushError(`Shopify API error ${res.status}`, {
      status: res.status,
      responseBodyPreview: previewValue(text, 300),
      graphqlErrors: json?.errors ?? null,
    });
  }

  if (!json) {
    throw new ShopifyPushError("Shopify returned invalid JSON", {
      responseBodyPreview: previewValue(text, 300),
    });
  }
  if (json.errors) {
    throw new ShopifyPushError("Shopify GraphQL errors", {
      graphqlErrors: json.errors,
    });
  }
  return json.data;
}

async function loadArtistSummary(product: Pick<CanonicalProduct, "canonicalArtistId" | "artistKey">): Promise<ArtistSummary | null> {
  if (!product.canonicalArtistId) return null;
  const artist = await CanonicalArtistModel.findById(product.canonicalArtistId)
    .select({ _id: 1, displayName: 1, publicSlug: 1, handle: 1, artistKey: 1, appUrl: 1, shopifyMetaobjectId: 1, shopify: 1 })
    .lean();
  if (!artist) return null;
  return {
    id: String(artist._id),
    displayName: artist.displayName || undefined,
    publicSlug: artist.publicSlug || undefined,
    handle: artist.handle || undefined,
    artistKey: artist.artistKey || undefined,
    appUrl: artist.appUrl || undefined,
    shopifyMetaobjectId: artist.shopifyMetaobjectId || undefined,
    shopifyMetaobjectGid: artist.shopify?.metaobjectGid || undefined,
  };
}

async function createShopifyProduct(product: PushableProduct, imageUrls: string[]) {
  const mutation = `
    mutation PushProductCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
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
    artistMetaobjectGid: product.artistMetaobjectGidForShopify,
    artistSlug: product.artistSlugForShopify,
    widthCm: product.dimensions?.widthCm,
    heightCm: product.dimensions?.heightCm,
    kurzbeschreibung: product.shortDescription || product.shortText || undefined,
  });
  const media = imageUrls.map((url) => ({
    originalSource: url,
    mediaContentType: "IMAGE",
    alt: product.title,
  }));

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
      descriptionHtml: product.bodyHtml || product.descriptionHtml || product.description || undefined,
      vendor: product.vendor || "artclub",
      tags: product.tags || [],
      status: normalizeShopStatus(product.status),
      metafields,
    },
    media,
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

async function updateShopifyProduct(productGid: string, product: PushableProduct) {
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
      descriptionHtml: product.bodyHtml || product.descriptionHtml || product.description || undefined,
      vendor: product.vendor || "artclub",
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

async function createProductMedia(productGid: string, product: PushableProduct, imageUrls: string[]) {
  if (!imageUrls.length) return;

  const existing = await callShopifyAdmin<{
    product?: {
      media?: {
        nodes?: Array<{
          image?: { url?: string | null } | null;
        }>;
      };
    } | null;
  }>(
    `
      query PushProductMediaExisting($id: ID!) {
        product(id: $id) {
          media(first: 100) {
            nodes {
              ... on MediaImage {
                image { url }
              }
            }
          }
        }
      }
    `,
    { id: productGid },
  );

  const existingUrls = new Set(
    (existing?.product?.media?.nodes || []).map((node) => (node.image?.url || "").trim()).filter(Boolean),
  );
  const media = imageUrls.filter((url) => !existingUrls.has(url)).map((url) => ({
    originalSource: url,
    mediaContentType: "IMAGE",
    alt: product.title,
  }));
  if (!media.length) return;

  const mutation = `
    mutation PushProductMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id }
        mediaUserErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin<{
    productCreateMedia?: {
      mediaUserErrors?: Array<{ message?: string }>;
    };
  }>(mutation, { productId: productGid, media });

  const errors = data?.productCreateMedia?.mediaUserErrors || [];
  if (errors.length) {
    const message = errors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || "Shopify product media upload failed");
  }
}

async function setProductMetafields(productGid: string, product: PushableProduct) {
  const mutation = `
    mutation PushProductMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message code }
      }
    }
  `;

  const metafields = buildProductMetafieldsForArtwork({
    artistMetaobjectGid: product.artistMetaobjectGidForShopify,
    artistSlug: product.artistSlugForShopify,
    widthCm: product.dimensions?.widthCm,
    heightCm: product.dimensions?.heightCm,
    kurzbeschreibung: product.shortDescription || product.shortText || undefined,
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

async function bulkCreateShopifyVariants(
  productGid: string,
  variants: Array<{ variantKey: string; finish: string; sizeCode: string; sku: string; priceCents: number }>,
): Promise<ShopifyVariantNode[]> {
  if (!variants.length) return [];

  const mutation = `
    mutation PushVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          sku
          inventoryItem { id }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin<{
    productVariantsBulkCreate?: {
      productVariants?: ShopifyVariantNode[];
      userErrors?: Array<{ message?: string }>;
    };
  }>(mutation, {
    productId: productGid,
    variants: variants.map((variant) => ({
      sku: variant.sku,
      price: normalizePrice(variant.priceCents),
      optionValues: [
        {
          optionName: "Finish",
          name: variant.finish || "Edition Art Print",
        },
        {
          optionName: "Size",
          name: variant.sizeCode || "Default",
        },
      ],
    })),
  });

  const payload = data?.productVariantsBulkCreate;
  if (!payload) throw new Error("Shopify productVariantsBulkCreate returned no payload");
  if (payload.userErrors?.length) {
    const message = payload.userErrors.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || "Shopify productVariantsBulkCreate failed");
  }
  return payload.productVariants || [];
}

export async function pushArtists(input: PushInput): Promise<PushResult> {
  assertShopifyWriteEnabled();
  await connectMongo();
  const syncMode = getArtistShopifySyncMode();
  const runId = input.runId || createSyncRunId("shopify-push");

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 250);
  const artists = await CanonicalArtistModel.find({
    shopDomain: input.shopDomain,
    ...(input.artistKeys?.length ? { artistKey: { $in: input.artistKeys } } : { "sync.needsPush": true }),
  })
    .sort({ "sync.dirtyAt": 1, updatedAt: 1 })
    .limit(limit)
    .lean();

  let pushedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const items: Array<{ key: string; status: PushItemStatus; message: string }> = [];

  for (const artist of artists) {
    try {
      const appUrl = resolveArtistAppUrl(artist);
      const willUpdate = Boolean(artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid);
      const payloadFields: Parameters<typeof upsertArtistMetaobject>[0]["fields"] =
        syncMode === "legacy"
          ? {
              app_url: appUrl,
              name: artist.displayName,
              instagram: artist.instagram || undefined,
              quote: artist.quote || undefined,
              einleitung_1: artist.introduction || undefined,
              text_1: artist.longText || artist.bio || undefined,
              bilder: artist.profileImages?.heroUrl || undefined,
              bild_1: artist.profileImages?.avatarUrl || undefined,
              bild_2: artist.profileImages?.galleryUrls?.[1] || undefined,
              bild_3: artist.profileImages?.galleryUrls?.[2] || undefined,
            }
          : {
              app_url: appUrl,
              name: artist.displayName,
            };

      logShopifyPush(
        "shopify_artist_push_preflight",
        {
          canonicalArtistId: String(artist._id),
          displayName: artist.displayName || null,
          publicSlug: artist.publicSlug || null,
          appUrl: appUrl || null,
          existingMetaobjectGid: artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid || null,
          willCreate: !willUpdate,
          willUpdate,
          hasCoverImage: Boolean(artist.profileImages?.heroUrl),
          galleryImageCount: Array.isArray(artist.profileImages?.galleryUrls) ? artist.profileImages.galleryUrls.length : 0,
        },
        { runId },
      );

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

      logShopifyPush(
        "shopify_artist_push_payload",
        {
          metaobjectType: "kunstler",
          fields: {
            name: Boolean(payloadFields.name),
            app_url: Boolean(payloadFields.app_url),
            instagram: Boolean(payloadFields.instagram),
            quote: Boolean(payloadFields.quote),
            einleitung_1: Boolean(payloadFields.einleitung_1),
            text_1: Boolean(payloadFields.text_1),
            bilder: Boolean(payloadFields.bilder),
            bild_1: Boolean(payloadFields.bild_1),
            bild_2: Boolean(payloadFields.bild_2),
            bild_3: Boolean(payloadFields.bild_3),
          },
        },
        { runId },
      );

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
        fields: payloadFields,
      });

      logShopifyPush(
        "shopify_artist_push_response",
        {
          metaobjectGid: result.id,
          userErrors: [],
          graphqlErrors: [],
        },
        { runId },
      );

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
            "sync.status": "synced",
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
            "sync.status": "error",
          },
        },
      );
      failedCount += 1;
      const message = `${artist.artistKey} [mode=${syncMode}]: ${error instanceof Error ? error.message : "push_failed"}`;
      errors.push(message);
      items.push({ key: artist.artistKey, status: "error", message });
      logSyncError(
        "shopify_artist_push_failed",
        error,
        {
          shopDomain: input.shopDomain,
          artistKey: artist.artistKey,
          canonicalArtistId: String(artist._id),
          syncMode,
        },
        { runId, force: true },
      );
    }
  }

  return { pushedCount, failedCount, skippedCount, errors, items };
}

export async function pushProducts(input: PushInput): Promise<PushResult> {
  assertShopifyWriteEnabled();
  await connectMongo();
  const runId = input.runId || createSyncRunId("shopify-push");

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
      let productGid = product.shopifyProductId || product.shopify?.productGid || "";
      const artistSummary = await loadArtistSummary(product);
      const artistResolution = await ensureArtistMetaobjectGidForProduct(product, artistSummary, runId);
      const canonicalVariants = await CanonicalVariantModel.find({
        shopDomain: input.shopDomain,
        productKey: product.productKey,
      })
        .sort({ updatedAt: 1, createdAt: 1 })
        .lean();
      const productForPush: PushableProduct = {
        ...product,
        artistSlugForShopify: artistResolution.artistSlug || (await resolveArtistSlugForProduct(product)),
        artistMetaobjectGidForShopify: artistResolution.artistMetaobjectGid || undefined,
      };
      const willUpdate = Boolean(productGid);
      const imageUrls = await resolvePushableProductImageUrls(product, runId);
      const metafieldSummary = buildProductMetafieldsForArtwork({
        artistMetaobjectGid: productForPush.artistMetaobjectGidForShopify,
        artistSlug: productForPush.artistSlugForShopify,
        widthCm: product.dimensions?.widthCm,
        heightCm: product.dimensions?.heightCm,
        kurzbeschreibung: product.shortDescription || product.shortText || undefined,
      });

      logShopifyPush(
        "shopify_product_push_preflight",
        {
          canonicalProductId: String(product._id),
          title: product.title,
          canonicalArtistId: product.canonicalArtistId ? String(product.canonicalArtistId) : null,
          hasArtist: Boolean(product.canonicalArtistId),
          artistName: artistSummary?.displayName || null,
          artistSlug: productForPush.artistSlugForShopify || null,
          artistMetaobjectGid: productForPush.artistMetaobjectGidForShopify || null,
          isSaleable: saleableCheck.ok,
          forSale: product.forSale === true,
          allowPrints: product.allowPrints === true,
          status: product.status,
          existingShopifyProductId: product.shopifyProductId || null,
          existingProductGid: product.shopify?.productGid || product.shopifyProductId || null,
          willCreate: !willUpdate,
          willUpdate,
          imageCount: imageUrls.length,
          variantCount: canonicalVariants.length,
        },
        { runId },
      );

      if (!saleableCheck.ok) {
        skippedCount += 1;
        items.push({ key: product.productKey, status: "skipped", message: saleableCheck.reason });
        continue;
      }

      let defaultVariantId: string | null = null;
      let defaultInventoryItemId: string | null = null;

      logShopifyPush(
        "shopify_product_push_payload",
        {
          title: product.title,
          vendor: product.vendor || "artclub",
          status: normalizeShopStatus(product.status),
          metafields: {
            "custom.kunstler": {
              type: metafieldSummary.find((item) => item.key === "kunstler")?.type || null,
              value: metafieldSummary.find((item) => item.key === "kunstler")?.value || null,
              artistSlug: productForPush.artistSlugForShopify || null,
            },
            "custom.kurzbeschreibung": metafieldSummary.some((item) => item.key === "kurzbeschreibung"),
            "custom.breite_cm_": metafieldSummary.find((item) => item.key === "breite_cm_")?.value || null,
            "custom.height": metafieldSummary.find((item) => item.key === "height")?.value || null,
          },
          options: {
            Finish: Array.from(new Set(canonicalVariants.map((variant) => variant.finish).filter(Boolean))),
            Size: Array.from(new Set(canonicalVariants.map((variant) => variant.sizeCode).filter(Boolean))),
          },
          mediaCount: imageUrls.length,
          variants: canonicalVariants.map((variant) => ({
            sku: variant.sku,
            finish: variant.finish,
            size: variant.sizeCode,
            price: normalizePrice(variant.priceCents),
          })),
        },
        { runId },
      );

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
        await updateShopifyProduct(productGid, productForPush);
      } else {
        const created = await createShopifyProduct(productForPush, imageUrls);
        productGid = created.productId;
        defaultVariantId = created.defaultVariantId;
        defaultInventoryItemId = created.defaultInventoryItemId;
      }

      await setProductMetafields(productGid, productForPush);
      if (willUpdate) await createProductMedia(productGid, productForPush, imageUrls);

      const shopifyVariants = await fetchShopifyProductVariants(productGid);
      const variantBySku = new Map(
        shopifyVariants
          .filter((variant) => typeof variant.sku === "string" && variant.sku.trim())
          .map((variant) => [variant.sku!.trim(), variant]),
      );

      const updates: Array<{ variantGid: string; sku: string; priceCents: number }> = [];
      const missingVariants: Array<{ variantKey: string; finish: string; sizeCode: string; sku: string; priceCents: number }> = [];
      for (const [index, variant] of canonicalVariants.entries()) {
        const matchedBySku = variant.sku ? variantBySku.get(variant.sku) : undefined;
        const fallbackDefault = !variant.shopify?.variantGid && !variant.shopifyVariantId && !matchedBySku && index === 0 ? defaultVariantId : null;
        const variantGid = variant.shopifyVariantId || variant.shopify?.variantGid || matchedBySku?.id || fallbackDefault || null;
        if (!variantGid) {
          missingVariants.push({
            variantKey: variant.variantKey,
            finish: variant.finish,
            sizeCode: variant.sizeCode,
            sku: variant.sku,
            priceCents: variant.priceCents,
          });
          continue;
        }
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
              published: product.status !== "archived",
              syncState: product.status === "archived" ? "archived" : "published",
              "shopify.variantGid": variantGid,
              ...(inventoryItemGid ? { "shopify.inventoryItemGid": inventoryItemGid } : {}),
            },
          },
        );
      }

      await bulkUpdateShopifyVariants(productGid, updates);

      if (missingVariants.length) {
        const createdVariants = await bulkCreateShopifyVariants(productGid, missingVariants);
        const createdBySku = new Map(
          createdVariants
            .filter((variant) => typeof variant.sku === "string" && variant.sku.trim())
            .map((variant) => [variant.sku!.trim(), variant]),
        );

        for (const variant of missingVariants) {
          const created = createdBySku.get(variant.sku);
          if (!created?.id) throw new Error(`Shopify did not return created variant for ${variant.variantKey}`);
          await CanonicalVariantModel.updateOne(
            { shopDomain: input.shopDomain, productKey: product.productKey, variantKey: variant.variantKey },
            {
              $set: {
                shopifyVariantId: created.id,
                published: true,
                syncState: "published",
                "shopify.variantGid": created.id,
                ...(created.inventoryItem?.id ? { "shopify.inventoryItemGid": created.inventoryItem.id } : {}),
              },
            },
          );
        }
      }

      logShopifyPush(
        "shopify_product_push_response",
        {
          operationName: willUpdate ? "productUpdate" : "productCreate",
          productId: productGid,
          userErrors: [],
          graphqlErrors: [],
          createdOrUpdated: willUpdate ? "updated" : "created",
          variantOperationsCount: updates.length + missingVariants.length,
        },
        { runId },
      );

      await CanonicalProductModel.updateOne(
        { shopDomain: input.shopDomain, productKey: product.productKey },
        {
          $set: {
            shopifyProductId: productGid,
            status: product.status === "archived" ? "archived" : "shopify_synced",
            migrationStatus: "linked",
            approvalStatus: product.status === "archived" ? "archived" : "published",
            "shopify.productGid": productGid,
            "shopify.lastPushedAt": new Date(),
            "sync.lastPushAt": new Date(),
            "sync.lastError": null,
            "sync.status": "synced",
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

      const storedVariants = await CanonicalVariantModel.find({
        shopDomain: input.shopDomain,
        productKey: product.productKey,
      })
        .select({ _id: 1 })
        .lean();

      logShopifyPush(
        "shopify_product_push_db_updated",
        {
          canonicalProductId: String(product._id),
          shopifyProductId: productGid,
          productGid,
          syncNeedsPush: false,
          syncStatus: "synced",
          lastPushAt: new Date().toISOString(),
          variantIdsStoredCount: storedVariants.length,
        },
        { runId },
      );
    } catch (error) {
      await CanonicalProductModel.updateOne(
        { shopDomain: input.shopDomain, productKey: product.productKey },
        {
          $set: {
            "sync.lastError": error instanceof Error ? error.message : "push_failed",
            "sync.status": "error",
          },
        },
      );
      failedCount += 1;
      const message = `${product.productKey}: ${error instanceof Error ? error.message : "push_failed"}`;
      errors.push(message);
      items.push({ key: product.productKey, status: "error", message });
      logSyncError(
        "shopify_product_push_failed",
        error,
        {
          shopDomain: input.shopDomain,
          productKey: product.productKey,
          canonicalProductId: String(product._id),
          existingProductGid: product.shopify?.productGid || product.shopifyProductId || null,
        },
        { runId, force: true },
      );
    }
  }

  return { pushedCount, failedCount, skippedCount, errors, items };
}

export async function pushOneArtist(input: { shopDomain: string; artistKey: string; dryRun?: boolean; runId?: string }): Promise<PushResult> {
  return pushArtists({
    shopDomain: input.shopDomain,
    artistKeys: [input.artistKey],
    limit: 1,
    dryRun: input.dryRun,
    runId: input.runId,
  });
}

export async function pushOneProduct(input: {
  shopDomain: string;
  productKey: string;
  dryRun?: boolean;
  runId?: string;
}): Promise<PushResult> {
  return pushProducts({
    shopDomain: input.shopDomain,
    productKeys: [input.productKey],
    limit: 1,
    approvedOnly: false,
    dryRun: input.dryRun,
    runId: input.runId,
  });
}
