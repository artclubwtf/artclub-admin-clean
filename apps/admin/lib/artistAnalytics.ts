import { createHash } from "crypto";
import { Types } from "mongoose";
import { z } from "zod";

import {
  analyticsEventTypes,
  analyticsProductEventTypes,
  resolveArtistAnalyticsDateRange,
  type AnalyticsEventType,
  type ArtistAnalyticsRange,
} from "@artclub/models";

import { mapShopifyProductToCanonicalArtist } from "@/lib/sync/shopifyMapping";
import { resolveShopDomain } from "@/lib/shopDomain";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { connectMongo } from "@/lib/mongodb";
import { AnalyticsDailyAggregateModel } from "@/models/AnalyticsDailyAggregate";
import { AnalyticsEventModel } from "@/models/AnalyticsEvent";
import { AnalyticsUniqueVisitorModel } from "@/models/AnalyticsUniqueVisitor";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";

export const analyticsViewEventTypes = ["artist_profile_view", "artwork_view"] as const;
export const analyticsImpressionEventTypes = ["artist_profile_impression", "artwork_impression"] as const;
export const analyticsClickEventTypes = ["artwork_click", "shopify_product_click"] as const;
export const analyticsSources = ["shopify", "shopify_artist_embed", "artist_app_embed", "artist_app"] as const;

const analyticsEventTypeSet = new Set<string>(analyticsEventTypes);
const analyticsProductEventTypeSet = new Set<string>(analyticsProductEventTypes);

const incomingAnalyticsPayloadSchema = z.object({
  eventType: z.enum(analyticsEventTypes),
  source: z.enum(analyticsSources).optional().default("shopify"),
  path: z.string().trim().max(1200).optional().default(""),
  referrer: z.string().trim().max(1200).optional().default(""),
  pageHandle: z.string().trim().max(200).optional(),
  pageUrl: z.string().trim().max(1200).optional(),
  canonicalArtistId: z.string().trim().max(120).optional(),
  artistSlug: z.string().trim().max(200).optional(),
  artistMetaobjectId: z.string().trim().max(200).optional(),
  artistName: z.string().trim().max(200).optional(),
  canonicalProductId: z.string().trim().max(120).optional(),
  productKey: z.string().trim().max(120).optional(),
  shopifyProductId: z.string().trim().max(120).optional(),
  productHandle: z.string().trim().max(200).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  visitorId: z.string().trim().min(8).max(200),
});

type IncomingAnalyticsPayload = z.infer<typeof incomingAnalyticsPayloadSchema>;

type ResolvedAnalyticsIdentity = {
  canonicalArtistId: Types.ObjectId | null;
  canonicalProductId: Types.ObjectId | null;
  artistSlug?: string;
  productKey?: string;
  productHandle?: string;
  shopifyProductId?: string;
  resolutionStatus: "matched" | "partial" | "unmatched";
  resolutionReason: string;
};

export function resolveAnalyticsDateRange(range: ArtistAnalyticsRange) {
  return resolveArtistAnalyticsDateRange(range);
}

export function buildAnalyticsCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

export async function ingestAnalyticsEvent(req: Request) {
  const headers = buildAnalyticsCorsHeaders();
  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return {
      status: 503,
      headers,
      body: { ok: false, error: "shop_domain_not_configured" },
    };
  }

  const ip = getClientIp(req);
  const limit = rateLimit(`analytics-track:${ip}`, { limit: 240, windowMs: 60_000 });
  if (!limit.ok) {
    return {
      status: 429,
      headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds) },
      body: { ok: false, error: "rate_limited" },
    };
  }

  const payloadResult = incomingAnalyticsPayloadSchema.safeParse(await readAnalyticsPayload(req));
  if (!payloadResult.success) {
    return {
      status: 400,
      headers,
      body: { ok: false, error: "invalid_payload", details: payloadResult.error.flatten() },
    };
  }
  const payload = normalizeIncomingPayload(payloadResult.data);

  await connectMongo();

  const identity = await resolveAnalyticsIdentity(shopDomain, payload);
  const visitorIdHash = hashVisitorId(payload.visitorId);
  const eventDate = normalizeTimestamp(payload.timestamp);
  const geo = extractGeo(req);
  const userAgent = normalizeUserAgent(req.headers.get("user-agent"));

  await AnalyticsEventModel.create({
    eventType: payload.eventType,
    source: payload.source,
    path: payload.path || undefined,
    referrer: payload.referrer || undefined,
    pageHandle: payload.pageHandle || undefined,
    pageUrl: payload.pageUrl || undefined,
    visitorIdHash,
    canonicalArtistId: identity.canonicalArtistId || undefined,
    artistSlug: identity.artistSlug || payload.artistSlug || undefined,
    artistMetaobjectId: payload.artistMetaobjectId || undefined,
    artistName: payload.artistName || undefined,
    canonicalProductId: identity.canonicalProductId || undefined,
    productKey: identity.productKey || payload.productKey || undefined,
    shopifyProductId: identity.shopifyProductId || payload.shopifyProductId || undefined,
    productHandle: identity.productHandle || payload.productHandle || undefined,
    city: geo.city,
    region: geo.region,
    country: geo.country,
    deviceCategory: userAgent.deviceCategory,
    browserFamily: userAgent.browserFamily,
    resolutionStatus: identity.resolutionStatus,
    resolutionReason: identity.resolutionReason,
    createdAt: eventDate,
  });

  if (!identity.canonicalArtistId) {
    return {
      status: 202,
      headers,
      body: { ok: true, accepted: true, matched: false, reason: identity.resolutionReason },
    };
  }

  const uniqueInserted = await upsertUniqueVisitor({
    date: eventDate,
    eventType: payload.eventType,
    source: payload.source,
    visitorIdHash,
    canonicalArtistId: identity.canonicalArtistId,
    canonicalProductId: identity.canonicalProductId,
    artistSlug: identity.artistSlug,
    productKey: identity.productKey,
    productHandle: identity.productHandle,
    country: geo.country,
    region: geo.region,
    city: geo.city,
  });

  await upsertDailyAggregates({
    date: eventDate,
    eventType: payload.eventType,
    source: payload.source,
    canonicalArtistId: identity.canonicalArtistId,
    canonicalProductId: identity.canonicalProductId,
    artistSlug: identity.artistSlug,
    productKey: identity.productKey,
    productHandle: identity.productHandle,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    incrementUnique: uniqueInserted ? 1 : 0,
  });

  return {
    status: 200,
    headers,
    body: { ok: true, accepted: true, matched: true, resolutionStatus: identity.resolutionStatus },
  };
}

async function readAnalyticsPayload(req: Request) {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return (await req.json().catch(() => null)) as unknown;
  }

  const text = await req.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function normalizeIncomingPayload(payload: IncomingAnalyticsPayload): IncomingAnalyticsPayload {
  return {
    ...payload,
    path: normalizePath(payload.path),
    referrer: normalizeUrlPath(payload.referrer),
    pageHandle: normalizeSlugLike(payload.pageHandle),
    pageUrl: normalizePath(payload.pageUrl),
    artistSlug: normalizeSlugLike(payload.artistSlug),
    artistMetaobjectId: payload.artistMetaobjectId?.trim() || undefined,
    artistName: payload.artistName?.trim() || undefined,
    productHandle: normalizeSlugLike(payload.productHandle),
    productKey: payload.productKey?.trim() || undefined,
    shopifyProductId: payload.shopifyProductId?.trim() || undefined,
    canonicalArtistId: payload.canonicalArtistId?.trim() || undefined,
    canonicalProductId: payload.canonicalProductId?.trim() || undefined,
  };
}

async function resolveAnalyticsIdentity(shopDomain: string, payload: IncomingAnalyticsPayload): Promise<ResolvedAnalyticsIdentity> {
  const artistSlugFromPath = firstTruthy([
    extractArtistSlugFromPath(payload.path),
    extractArtistSlugFromPath(payload.pageUrl || ""),
  ]);
  const artistSlugFromPageHandle = extractArtistSlugFromPageHandle(payload.pageHandle, payload.pageUrl);
  const productHandleFromPath = extractProductHandleFromPath(payload.path);

  let artist: null | {
    _id: Types.ObjectId;
    publicSlug?: string | null;
    handle?: string | null;
    artistKey?: string | null;
  } = null;

  let product: null | {
    _id: Types.ObjectId;
    canonicalArtistId?: Types.ObjectId | null;
    productKey?: string | null;
    handle?: string | null;
    shopifyProductId?: string | null;
    artistSlug?: string | null;
    vendor?: string | null;
  } = null;

  if (payload.canonicalProductId && Types.ObjectId.isValid(payload.canonicalProductId)) {
    product = await CanonicalProductModel.findOne({
      _id: new Types.ObjectId(payload.canonicalProductId),
      shopDomain,
    })
      .select({ _id: 1, canonicalArtistId: 1, productKey: 1, handle: 1, shopifyProductId: 1, artistSlug: 1, vendor: 1 })
      .lean();
  }

  if (!product) {
    const productOr: Record<string, unknown>[] = [];
    if (payload.productKey) productOr.push({ productKey: payload.productKey });
    if (payload.shopifyProductId) productOr.push({ shopifyProductId: payload.shopifyProductId });
    if (payload.productHandle) productOr.push({ handle: new RegExp(`^${escapeRegex(payload.productHandle)}$`, "i") });
    if (productHandleFromPath) productOr.push({ handle: new RegExp(`^${escapeRegex(productHandleFromPath)}$`, "i") });
    if (productOr.length) {
      product = await CanonicalProductModel.findOne({ shopDomain, $or: productOr })
        .select({ _id: 1, canonicalArtistId: 1, productKey: 1, handle: 1, shopifyProductId: 1, artistSlug: 1, vendor: 1 })
        .lean();
    }
  }

  if (payload.canonicalArtistId && Types.ObjectId.isValid(payload.canonicalArtistId)) {
    artist = await CanonicalArtistModel.findOne({
      _id: new Types.ObjectId(payload.canonicalArtistId),
      shopDomain,
    })
      .select({ _id: 1, publicSlug: 1, handle: 1, artistKey: 1 })
      .lean();
  }

  if (!artist && product?.canonicalArtistId && Types.ObjectId.isValid(product.canonicalArtistId)) {
    artist = await CanonicalArtistModel.findById(product.canonicalArtistId)
      .select({ _id: 1, publicSlug: 1, handle: 1, artistKey: 1 })
      .lean();
  }

  if (!artist && payload.artistMetaobjectId) {
    const mapped = await mapShopifyProductToCanonicalArtist({
      shopDomain,
      customKunstlerValue: payload.artistMetaobjectId,
      customKunstlerHandle: payload.artistMetaobjectId,
      customKunstlerDisplayName: payload.artistName,
    });
    if (mapped.selectedArtist?._id && Types.ObjectId.isValid(String(mapped.selectedArtist._id))) {
      artist = await CanonicalArtistModel.findById(mapped.selectedArtist._id)
        .select({ _id: 1, publicSlug: 1, handle: 1, artistKey: 1 })
        .lean();
    }
  }

  const artistSlugCandidates = [
    payload.artistSlug,
    artistSlugFromPageHandle,
    artistSlugFromPath,
    product?.artistSlug,
  ].filter(Boolean) as string[];
  if (!artist) {
    for (const slugCandidate of artistSlugCandidates) {
      artist = await findArtistBySlug(shopDomain, slugCandidate);
      if (artist) break;
    }
  }

  if (!artist) {
    const mappingCandidates = uniqStrings([
      payload.artistMetaobjectId,
      ...artistSlugCandidates,
      payload.artistName,
    ]);
    for (const slugCandidate of mappingCandidates) {
      const mapped = await mapShopifyProductToCanonicalArtist({
        shopDomain,
        customKunstlerValue: slugCandidate,
        customKunstlerHandle: slugCandidate,
        customKunstlerDisplayName: payload.artistName || slugCandidate,
      });
      if (mapped.selectedArtist?._id && Types.ObjectId.isValid(String(mapped.selectedArtist._id))) {
        artist = await CanonicalArtistModel.findById(mapped.selectedArtist._id)
          .select({ _id: 1, publicSlug: 1, handle: 1, artistKey: 1 })
          .lean();
      }
      if (artist) break;
    }
  }

  if (!artist && product?.vendor) {
    artist = await findArtistByVendor(shopDomain, product.vendor);
  }

  const productRequired = analyticsProductEventTypeSet.has(payload.eventType);
  const resolvedArtistId = artist?._id || product?.canonicalArtistId || null;
  const resolvedStatus: ResolvedAnalyticsIdentity["resolutionStatus"] = !resolvedArtistId
    ? "unmatched"
    : productRequired && !product
      ? "partial"
      : "matched";

  return {
    canonicalArtistId: resolvedArtistId,
    canonicalProductId: product?._id || null,
    artistSlug: firstTruthy([
      artist?.publicSlug || undefined,
      artist?.handle || undefined,
      artist?.artistKey || undefined,
      payload.artistSlug,
      artistSlugFromPageHandle,
      artistSlugFromPath,
    ]),
    productKey: product?.productKey || payload.productKey || undefined,
    productHandle: product?.handle || payload.productHandle || productHandleFromPath || undefined,
    shopifyProductId: product?.shopifyProductId || payload.shopifyProductId || undefined,
    resolutionStatus: resolvedStatus,
    resolutionReason: buildResolutionReason({
      resolvedArtistId,
      hasProduct: Boolean(product),
      productRequired,
      payload,
      artistFromPath: artistSlugFromPath,
      productFromPath: productHandleFromPath,
    }),
  };
}

function buildResolutionReason(input: {
  resolvedArtistId: Types.ObjectId | null;
  hasProduct: boolean;
  productRequired: boolean;
  payload: IncomingAnalyticsPayload;
  artistFromPath?: string;
  productFromPath?: string;
}) {
  if (!input.resolvedArtistId) return "artist_unmatched";
  if (input.productRequired && !input.hasProduct) {
    if (input.payload.productHandle || input.productFromPath) return "product_unmatched";
    return "artist_only_product_event";
  }
  if (input.payload.canonicalProductId || input.payload.canonicalArtistId) return "resolved_from_canonical_ids";
  if (input.payload.artistMetaobjectId) return "resolved_from_artist_metaobject";
  if (input.payload.shopifyProductId) return "resolved_from_shopify_product_id";
  if (input.payload.productHandle || input.productFromPath) return "resolved_from_product_handle";
  if (input.payload.pageHandle || input.payload.pageUrl) return "resolved_from_page_context";
  if (input.payload.artistSlug || input.artistFromPath) return "resolved_from_artist_slug";
  return "resolved_from_fallback";
}

async function findArtistBySlug(shopDomain: string, slug: string) {
  const normalized = normalizeSlugLike(slug);
  if (!normalized) return null;
  return CanonicalArtistModel.findOne({
    shopDomain,
    $or: [
      { publicSlug: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
      { handle: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
      { artistKey: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
    ],
  })
    .select({ _id: 1, publicSlug: 1, handle: 1, artistKey: 1 })
    .lean();
}

async function findArtistByVendor(shopDomain: string, vendor: string) {
  const normalized = normalizeVendor(vendor);
  if (!normalized) return null;
  const regex = new RegExp(`^${escapeRegex(normalized)}$`, "i");
  const matches = await CanonicalArtistModel.find({
    shopDomain,
    $or: [{ displayName: regex }, { publicSlug: regex }, { handle: regex }, { artistKey: regex }],
  })
    .select({ _id: 1, publicSlug: 1, handle: 1, artistKey: 1 })
    .limit(2)
    .lean();
  return matches.length === 1 ? matches[0] : null;
}

async function upsertUniqueVisitor(input: {
  date: Date;
  eventType: AnalyticsEventType;
  source: string;
  visitorIdHash: string;
  canonicalArtistId: Types.ObjectId;
  canonicalProductId: Types.ObjectId | null;
  artistSlug?: string;
  productKey?: string;
  productHandle?: string;
  country?: string;
  region?: string;
  city?: string;
}) {
  const dateKey = toDateKey(input.date);
  const uniqueKey = [
    dateKey,
    input.eventType,
    input.source,
    String(input.canonicalArtistId),
    input.canonicalProductId ? String(input.canonicalProductId) : "-",
    input.visitorIdHash,
  ].join("|");

  const result = await AnalyticsUniqueVisitorModel.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        uniqueKey,
        date: startOfUtcDay(input.date),
        dateKey,
        eventType: input.eventType,
        source: input.source,
        visitorIdHash: input.visitorIdHash,
        canonicalArtistId: input.canonicalArtistId,
        canonicalProductId: input.canonicalProductId || undefined,
        artistSlug: input.artistSlug || undefined,
        productKey: input.productKey || undefined,
        productHandle: input.productHandle || undefined,
        country: input.country || undefined,
        region: input.region || undefined,
        city: input.city || undefined,
      },
    },
    { upsert: true },
  );

  return Boolean(result.upsertedCount);
}

async function upsertDailyAggregates(input: {
  date: Date;
  eventType: AnalyticsEventType;
  source: string;
  canonicalArtistId: Types.ObjectId;
  canonicalProductId: Types.ObjectId | null;
  artistSlug?: string;
  productKey?: string;
  productHandle?: string;
  country?: string;
  region?: string;
  city?: string;
  incrementUnique: number;
}) {
  const date = startOfUtcDay(input.date);
  const dateKey = toDateKey(date);
  const operations = [
    buildAggregateOperation({
      date,
      dateKey,
      bucket: "overall",
      eventType: input.eventType,
      source: input.source,
      canonicalArtistId: input.canonicalArtistId,
      canonicalProductId: input.canonicalProductId,
      artistSlug: input.artistSlug,
      productKey: input.productKey,
      productHandle: input.productHandle,
      incrementUnique: input.incrementUnique,
    }),
  ];

  if (input.country) {
    operations.push(
      buildAggregateOperation({
        date,
        dateKey,
        bucket: "country",
        eventType: input.eventType,
        source: input.source,
        canonicalArtistId: input.canonicalArtistId,
        canonicalProductId: null,
        artistSlug: input.artistSlug,
        country: input.country,
        incrementUnique: input.incrementUnique,
      }),
    );
  }

  if (input.country && input.city) {
    operations.push(
      buildAggregateOperation({
        date,
        dateKey,
        bucket: "city",
        eventType: input.eventType,
        source: input.source,
        canonicalArtistId: input.canonicalArtistId,
        canonicalProductId: null,
        artistSlug: input.artistSlug,
        country: input.country,
        region: input.region,
        city: input.city,
        incrementUnique: input.incrementUnique,
      }),
    );
  }

  await AnalyticsDailyAggregateModel.bulkWrite(operations);
}

function buildAggregateOperation(input: {
  date: Date;
  dateKey: string;
  bucket: "overall" | "country" | "city";
  eventType: AnalyticsEventType;
  source: string;
  canonicalArtistId: Types.ObjectId;
  canonicalProductId: Types.ObjectId | null;
  artistSlug?: string;
  productKey?: string;
  productHandle?: string;
  country?: string;
  region?: string;
  city?: string;
  incrementUnique: number;
}) {
  const scopeKey = [
    input.dateKey,
    input.bucket,
    input.eventType,
    input.source,
    String(input.canonicalArtistId),
    input.canonicalProductId ? String(input.canonicalProductId) : "-",
    input.country || "-",
    input.region || "-",
    input.city || "-",
  ].join("|");

  return {
    updateOne: {
      filter: { scopeKey },
      update: {
        $setOnInsert: {
          scopeKey,
          date: input.date,
          dateKey: input.dateKey,
          bucket: input.bucket,
          eventType: input.eventType,
          source: input.source,
          canonicalArtistId: input.canonicalArtistId,
          canonicalProductId: input.canonicalProductId || undefined,
          productKey: input.productKey || undefined,
          productHandle: input.productHandle || undefined,
          artistSlug: input.artistSlug || undefined,
          country: input.country || undefined,
          region: input.region || undefined,
          city: input.city || undefined,
        },
        $inc: {
          count: 1,
          uniqueVisitors: input.incrementUnique,
        },
      },
      upsert: true,
    },
  };
}

function extractGeo(req: Request) {
  return {
    city: firstTruthy([
      req.headers.get("x-vercel-ip-city") || undefined,
      req.headers.get("x-city") || undefined,
    ]),
    region: firstTruthy([
      req.headers.get("x-vercel-ip-country-region") || undefined,
      req.headers.get("x-vercel-ip-region") || undefined,
      req.headers.get("x-region") || undefined,
    ]),
    country: firstTruthy([
      req.headers.get("x-vercel-ip-country") || undefined,
      req.headers.get("cf-ipcountry") || undefined,
      req.headers.get("x-country-code") || undefined,
      req.headers.get("x-country") || undefined,
    ]),
  };
}

function normalizeUserAgent(userAgent: string | null) {
  const value = (userAgent || "").toLowerCase();
  const deviceCategory = value.includes("bot")
    ? "bot"
    : value.includes("ipad") || value.includes("tablet")
      ? "tablet"
      : value.includes("mobile") || value.includes("iphone") || value.includes("android")
        ? "mobile"
        : value
          ? "desktop"
          : "unknown";

  let browserFamily = "unknown";
  if (value.includes("edg/")) browserFamily = "edge";
  else if (value.includes("chrome/")) browserFamily = "chrome";
  else if (value.includes("safari/") && !value.includes("chrome/")) browserFamily = "safari";
  else if (value.includes("firefox/")) browserFamily = "firefox";

  return { deviceCategory, browserFamily };
}

function hashVisitorId(visitorId: string) {
  return createHash("sha256").update(visitorId).digest("hex");
}

function normalizeTimestamp(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const numericDate = new Date(numeric);
      if (!Number.isNaN(numericDate.getTime())) return numericDate;
    }
    const stringDate = new Date(value);
    if (!Number.isNaN(stringDate.getTime())) return stringDate;
  }
  return new Date();
}

function normalizePath(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://artclub.invalid");
    return `${url.pathname}${url.search}`.slice(0, 1200);
  } catch {
    return raw.slice(0, 1200);
  }
}

function normalizeUrlPath(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (raw.length <= 1200) return raw;
  return raw.slice(0, 1200);
}

function extractArtistSlugFromPath(path: string) {
  const normalized = normalizePath(path);
  const match = normalized.match(/\/(?:pages\/kuenstler|artist)\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function extractArtistSlugFromPageHandle(pageHandle?: string, pageUrl?: string) {
  const pageSlugFromUrl = extractArtistSlugFromPath(pageUrl || "");
  if (pageSlugFromUrl) return pageSlugFromUrl;
  const normalizedHandle = normalizeSlugLike(pageHandle);
  if (!normalizedHandle) return undefined;
  if (normalizedHandle === "kunstler" || normalizedHandle.startsWith("kuenstler-")) return undefined;
  return normalizedHandle;
}

function extractProductHandleFromPath(path: string) {
  const normalized = normalizePath(path);
  const match = normalized.match(/\/products\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function normalizeSlugLike(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed.replace(/^\/+|\/+$/g, "") : undefined;
}

function normalizeVendor(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed || undefined;
}

function firstTruthy(values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function uniqStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function toDateKey(date: Date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export function isAnalyticsEventType(value: string): value is AnalyticsEventType {
  return analyticsEventTypeSet.has(value);
}
