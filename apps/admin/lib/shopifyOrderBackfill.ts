import { Types } from "mongoose";

import { fetchShopifyOrders, type ShopifyOrder, type ShopifyOrderLine } from "./shopifyOrders";
import { classifyArtistPayoutType, computeArtistPayout, computeRemainingGross, computeRemainingQuantity } from "./artistPayouts";
import {
  isCancelledShopifyOrder,
  isCountableShopifyOrder,
  isFullyRefundedShopifyOrder,
} from "./shopifyOrderStatus";
import { resolveShopDomain } from "./shopDomain";
import { logShopifyPull } from "./sync/syncLogger";
import { ArtistModel } from "../models/Artist";
import { CanonicalArtistModel } from "../models/CanonicalArtist";
import { CanonicalProductModel } from "../models/CanonicalProduct";
import { CanonicalVariantModel } from "../models/CanonicalVariant";
import { orderSaleTypes, ShopifyOrderCacheModel } from "../models/ShopifyOrderCache";
import { SyncStateModel } from "../models/SyncState";

type InferredSaleType = (typeof orderSaleTypes)[number];
type PayoutStatus = "pending" | "eligible" | "paid" | "partially_refunded" | "refunded" | "cancelled";

type BackfillProduct = {
  _id: Types.ObjectId;
  productKey: string;
  title: string;
  handle?: string | null;
  shopifyProductId?: string | null;
  offerings?: string | null;
  allowPrints?: boolean | null;
  originalAvailable?: boolean | null;
  canonicalArtistId?: Types.ObjectId | null;
  shopify?: {
    productGid?: string | null;
  };
};

type BackfillVariant = {
  canonicalProductId?: Types.ObjectId | null;
  canonicalArtistId?: Types.ObjectId | null;
  shopifyVariantId?: string | null;
  shopify?: {
    variantGid?: string | null;
  };
};

type BackfillArtist = {
  _id: Types.ObjectId;
  artistKey?: string | null;
  handle?: string | null;
  publicSlug?: string | null;
  displayName?: string | null;
  legacyArtistId?: string | null;
  shopifyMetaobjectId?: string | null;
  shopify?: {
    metaobjectGid?: string | null;
  };
};

type LegacyArtistName = {
  _id: Types.ObjectId;
  name?: string | null;
  publicProfile?: {
    displayName?: string | null;
    name?: string | null;
  };
};

type MatchOrigin = "metafield" | "vendor" | "variant" | "product" | "handle" | "unmatched";

type MatchResult = {
  canonicalProductId: Types.ObjectId | null;
  canonicalArtistId: Types.ObjectId | null;
  productKey: string | null;
  artworkTitle: string | null;
  productRecord: BackfillProduct | null;
  matchedBy: MatchOrigin;
};

type BackfillLineItem = {
  lineId: string;
  productKey: string | null;
  title: string;
  variantTitle: string | null;
  shopifyVariantId: string | null;
  shopifyVariantGid: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  refundedQuantity: number;
  refundedAmount: number;
  shopifyProductId: string | null;
  shopifyProductGid: string | null;
  productHandle: string | null;
  vendor: string | null;
  productTags: string[];
  artistMetaobjectGid: string | null;
  inferredSaleType: InferredSaleType;
  canonicalProductId: Types.ObjectId | null;
  canonicalArtistId: Types.ObjectId | null;
  artistShare?: number;
  estimatedArtistShare?: number;
  payoutStatus: PayoutStatus;
};

type BackfillDiagnosticsItem = {
  shopifyOrderId: string;
  orderName: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  title: string;
  lineItemTitle: string;
  variantTitle: string | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  productHandle: string | null;
  metafieldArtistGid: string | null;
  vendor: string | null;
  canonicalProductId: string | null;
  canonicalArtistId: string | null;
  matchedBy: MatchResult["matchedBy"];
};

type BackfillContext = Awaited<ReturnType<typeof loadBackfillContext>>;
type BackfillAccumulator = {
  processedOrdersCount: number;
  importedOrdersCount: number;
  processedLineItemsCount: number;
  matchedLineItemsCount: number;
  unmatchedLineItemsCount: number;
  skippedOrdersCount: number;
  latestMatched: BackfillDiagnosticsItem[];
  latestUnmatched: BackfillDiagnosticsItem[];
};

export type ShopifyOrdersBackfillResult = {
  ok: true;
  shopDomain: string;
  pageCount: number;
  processedOrdersCount: number;
  importedOrdersCount: number;
  processedLineItemsCount: number;
  matchedLineItemsCount: number;
  unmatchedLineItemsCount: number;
  skippedOrdersCount: number;
  latestMatched: BackfillDiagnosticsItem[];
  latestUnmatched: BackfillDiagnosticsItem[];
};

export type ShopifyOrdersBackfillOptions = {
  limitPerPage?: number;
  maxPages?: number;
  since?: string | null;
  runId?: string;
};

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function inferSaleType(line: ShopifyOrderLine, matchedProduct: BackfillProduct | null): InferredSaleType {
  return classifyArtistPayoutType({
    title: line.title,
    productTitle: matchedProduct?.title || line.title,
    variantTitle: line.variantTitle,
    tags: line.productTags,
    offerings: matchedProduct?.offerings || null,
    allowPrints: matchedProduct?.allowPrints ?? null,
    originalAvailable: matchedProduct?.originalAvailable ?? null,
  });
}

function buildAllocations(lines: BackfillLineItem[]) {
  const map = new Map<
    string,
    { artistMetaobjectGid: string; gross: number; saleTypeBreakdown: { printGross: number; originalGross: number } }
  >();

  for (const line of lines) {
    if (!line.artistMetaobjectGid) continue;
    const gross = Number(line.lineTotal || 0);
    const existing =
      map.get(line.artistMetaobjectGid) ??
      { artistMetaobjectGid: line.artistMetaobjectGid, gross: 0, saleTypeBreakdown: { printGross: 0, originalGross: 0 } };

    existing.gross += gross;
    if (line.inferredSaleType === "original") existing.saleTypeBreakdown.originalGross += gross;
    if (line.inferredSaleType === "print") existing.saleTypeBreakdown.printGross += gross;
    map.set(line.artistMetaobjectGid, existing);
  }

  return Array.from(map.values());
}

function createAccumulator(): BackfillAccumulator {
  return {
    processedOrdersCount: 0,
    importedOrdersCount: 0,
    processedLineItemsCount: 0,
    matchedLineItemsCount: 0,
    unmatchedLineItemsCount: 0,
    skippedOrdersCount: 0,
    latestMatched: [],
    latestUnmatched: [],
  };
}

async function loadBackfillContext(shopDomain: string) {
  const [products, variants, artists] = await Promise.all([
    CanonicalProductModel.find({ shopDomain })
      .select({
        _id: 1,
        productKey: 1,
        title: 1,
        handle: 1,
        shopifyProductId: 1,
        offerings: 1,
        allowPrints: 1,
        originalAvailable: 1,
        canonicalArtistId: 1,
        "shopify.productGid": 1,
      })
      .lean<BackfillProduct[]>(),
    CanonicalVariantModel.find({ shopDomain })
      .select({
        canonicalProductId: 1,
        canonicalArtistId: 1,
        shopifyVariantId: 1,
        "shopify.variantGid": 1,
      })
      .lean<BackfillVariant[]>(),
    CanonicalArtistModel.find({ shopDomain })
      .select({
        _id: 1,
        artistKey: 1,
        handle: 1,
        publicSlug: 1,
        displayName: 1,
        legacyArtistId: 1,
        shopifyMetaobjectId: 1,
        "shopify.metaobjectGid": 1,
      })
      .lean<BackfillArtist[]>(),
  ]);

  const legacyIds = artists.map((artist) => artist.legacyArtistId).filter((value): value is string => Boolean(value));
  const legacyArtists = legacyIds.length
    ? await ArtistModel.find({
        _id: { $in: legacyIds.filter((value) => Types.ObjectId.isValid(value)).map((value) => new Types.ObjectId(value)) },
      })
        .select({ _id: 1, name: 1, "publicProfile.displayName": 1, "publicProfile.name": 1 })
        .lean<LegacyArtistName[]>()
    : [];

  const productByVariantGid = new Map<string, MatchResult>();
  const productByProductGid = new Map<string, MatchResult>();
  const productByHandle = new Map<string, MatchResult>();
  const artistById = new Map<string, BackfillArtist>();
  const artistByMetaobjectGid = new Map<string, BackfillArtist>();
  const vendorCandidates = new Map<string, BackfillArtist[]>();
  const productById = new Map<string, BackfillProduct>();
  const legacyArtistById = new Map<string, LegacyArtistName>();

  for (const legacyArtist of legacyArtists) {
    legacyArtistById.set(String(legacyArtist._id), legacyArtist);
  }

  for (const artist of artists) {
    artistById.set(String(artist._id), artist);
    const metaobjectIds = [artist.shopify?.metaobjectGid, artist.shopifyMetaobjectId].map((value) => value?.trim()).filter(Boolean) as string[];
    metaobjectIds.forEach((metaobjectId) => artistByMetaobjectGid.set(metaobjectId, artist));

    const legacyArtist = artist.legacyArtistId ? legacyArtistById.get(artist.legacyArtistId) || null : null;
    const vendorKeys = [
      artist.displayName,
      artist.artistKey,
      artist.handle,
      artist.publicSlug,
      legacyArtist?.name,
      legacyArtist?.publicProfile?.displayName,
      legacyArtist?.publicProfile?.name,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean);

    vendorKeys.forEach((vendorKey) => {
      const existing = vendorCandidates.get(vendorKey) || [];
      existing.push(artist);
      vendorCandidates.set(vendorKey, existing);
    });
  }

  for (const product of products) {
    productById.set(String(product._id), product);
    const resolved: MatchResult = {
      canonicalProductId: product._id,
      canonicalArtistId: product.canonicalArtistId || null,
      productKey: product.productKey,
      artworkTitle: product.title,
      productRecord: product,
      matchedBy: "product",
    };

    const shopifyProductGid = product.shopify?.productGid?.trim();
    if (shopifyProductGid) productByProductGid.set(shopifyProductGid, resolved);
    const shopifyProductId = product.shopifyProductId?.trim();
    if (shopifyProductId) productByProductGid.set(shopifyProductId, resolved);
    const handle = product.handle?.trim().toLowerCase();
    if (handle) productByHandle.set(handle, { ...resolved, matchedBy: "handle" });
  }

  for (const variant of variants) {
    const canonicalProductId = variant.canonicalProductId ? String(variant.canonicalProductId) : null;
    const product = canonicalProductId ? productById.get(canonicalProductId) || null : null;
    const resolved: MatchResult = {
      canonicalProductId: variant.canonicalProductId || product?._id || null,
      canonicalArtistId: variant.canonicalArtistId || product?.canonicalArtistId || null,
      productKey: product?.productKey || null,
      artworkTitle: product?.title || null,
      productRecord: product,
      matchedBy: "variant",
    };

    const variantGid = variant.shopify?.variantGid?.trim();
    if (variantGid) productByVariantGid.set(variantGid, resolved);
    const variantId = variant.shopifyVariantId?.trim();
    if (variantId) productByVariantGid.set(variantId, resolved);
  }

  const artistByVendor = new Map<string, BackfillArtist>();
  for (const [vendorKey, candidates] of vendorCandidates.entries()) {
    const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [String(candidate._id), candidate])).values());
    if (uniqueCandidates.length === 1) {
      artistByVendor.set(vendorKey, uniqueCandidates[0]);
    }
  }

  return { productByVariantGid, productByProductGid, productByHandle, artistById, artistByMetaobjectGid, artistByVendor };
}

function matchLineItem(params: {
  line: ShopifyOrderLine;
  productByVariantGid: Map<string, MatchResult>;
  productByProductGid: Map<string, MatchResult>;
  productByHandle: Map<string, MatchResult>;
  artistByMetaobjectGid: Map<string, BackfillArtist>;
  artistByVendor: Map<string, BackfillArtist>;
}): MatchResult {
  let productMatch: MatchResult = {
    canonicalProductId: null,
    canonicalArtistId: null,
    productKey: null,
    artworkTitle: null,
    productRecord: null,
    matchedBy: "unmatched",
  };

  const variantKey = params.line.variantId?.trim();
  if (variantKey) {
    const matched = params.productByVariantGid.get(variantKey);
    if (matched) productMatch = matched;
  }

  if (!productMatch.canonicalProductId && !productMatch.canonicalArtistId) {
    const productKey = params.line.productId?.trim();
    if (productKey) {
      const matched = params.productByProductGid.get(productKey);
      if (matched) productMatch = matched;
    }
  }

  if (!productMatch.canonicalProductId && !productMatch.canonicalArtistId) {
    const handle = params.line.productHandle?.trim().toLowerCase();
    if (handle) {
      const matched = params.productByHandle.get(handle);
      if (matched) productMatch = matched;
    }
  }

  const metafieldArtist = params.line.artistMetaobjectGid?.trim()
    ? params.artistByMetaobjectGid.get(params.line.artistMetaobjectGid.trim()) || null
    : null;
  if (metafieldArtist) {
    const productArtistId = productMatch.canonicalArtistId ? String(productMatch.canonicalArtistId) : null;
    const metafieldArtistId = String(metafieldArtist._id);
    const keepProduct = !productArtistId || productArtistId === metafieldArtistId;

    return {
      canonicalProductId: keepProduct ? productMatch.canonicalProductId : null,
      canonicalArtistId: metafieldArtist._id,
      productKey: keepProduct ? productMatch.productKey : null,
      artworkTitle: keepProduct ? productMatch.artworkTitle : null,
      productRecord: keepProduct ? productMatch.productRecord : null,
      matchedBy: "metafield",
    };
  }

  const vendorKey = normalizeText(params.line.vendor);
  const vendorArtist = vendorKey ? params.artistByVendor.get(vendorKey) || null : null;
  if (vendorArtist) {
    const productArtistId = productMatch.canonicalArtistId ? String(productMatch.canonicalArtistId) : null;
    const vendorArtistId = String(vendorArtist._id);
    const keepProduct = !productArtistId || productArtistId === vendorArtistId;

    return {
      canonicalProductId: keepProduct ? productMatch.canonicalProductId : null,
      canonicalArtistId: vendorArtist._id,
      productKey: keepProduct ? productMatch.productKey : null,
      artworkTitle: keepProduct ? productMatch.artworkTitle : null,
      productRecord: keepProduct ? productMatch.productRecord : null,
      matchedBy: "vendor",
    };
  }

  return productMatch;
}

async function persistFetchedOrders(params: {
  shopDomain: string;
  orders: ShopifyOrder[];
  context: BackfillContext;
  runId?: string;
  accumulator: BackfillAccumulator;
}) {
  const { shopDomain, orders, context, runId, accumulator } = params;

  for (const order of orders) {
    accumulator.processedOrdersCount += 1;

    const cancelled = isCancelledShopifyOrder(order);
    const fullyRefunded = isFullyRefundedShopifyOrder(order);
    const countableSale = isCountableShopifyOrder(order);

    if (!countableSale && !cancelled && !fullyRefunded) {
      accumulator.skippedOrdersCount += 1;
      continue;
    }

    const lines: BackfillLineItem[] = order.lineItems.map((line, index) => {
      accumulator.processedLineItemsCount += 1;
      const match = matchLineItem({
        line,
        productByVariantGid: context.productByVariantGid,
        productByProductGid: context.productByProductGid,
        productByHandle: context.productByHandle,
        artistByMetaobjectGid: context.artistByMetaobjectGid,
        artistByVendor: context.artistByVendor,
      });
      const artistId = match.canonicalArtistId ? String(match.canonicalArtistId) : null;
      const artist = artistId ? context.artistById.get(artistId) || null : null;
      const lineTotal = Number(line.lineTotal || 0);
      const refundedAmount = Number(line.refundedAmount || 0);
      const refundedQuantity = Number(line.refundedQuantity || 0);
      const remainingGross = cancelled || fullyRefunded ? 0 : computeRemainingGross(lineTotal, refundedAmount);
      const remainingQuantity = cancelled || fullyRefunded ? 0 : computeRemainingQuantity(line.quantity, refundedQuantity);
      const inferredSaleType = inferSaleType(line, match.productRecord);
      const payout = computeArtistPayout(remainingGross, inferredSaleType);
      const payoutStatus: PayoutStatus =
        cancelled ? "cancelled" : fullyRefunded ? "refunded" : refundedAmount > 0 ? "partially_refunded" : "pending";
      const lineId = line.id || `${order.id}:line:${index}`;
      const artistMetaobjectGid =
        line.artistMetaobjectGid ||
        artist?.shopify?.metaobjectGid ||
        artist?.shopifyMetaobjectId ||
        null;

      const diagnosticItem: BackfillDiagnosticsItem = {
        shopifyOrderId: order.id,
        orderName: order.name || order.id,
        financialStatus: order.financialStatus || null,
        fulfillmentStatus: order.fulfillmentStatus || null,
        title: match.artworkTitle || line.title,
        lineItemTitle: match.artworkTitle || line.title,
        variantTitle: line.variantTitle || null,
        shopifyProductId: line.productId || null,
        shopifyVariantId: line.variantId || null,
        productHandle: line.productHandle || null,
        metafieldArtistGid: line.artistMetaobjectGid || null,
        vendor: line.vendor || null,
        canonicalProductId: match.canonicalProductId ? String(match.canonicalProductId) : null,
        canonicalArtistId: match.canonicalArtistId ? String(match.canonicalArtistId) : null,
        matchedBy: match.matchedBy,
      };

      if (match.canonicalArtistId) {
        accumulator.matchedLineItemsCount += 1;
        if (accumulator.latestMatched.length < 20) accumulator.latestMatched.push(diagnosticItem);
        logShopifyPull("shopify_orders_backfill_line_match", diagnosticItem, { runId, verboseOnly: true });
      } else {
        accumulator.unmatchedLineItemsCount += 1;
        if (accumulator.latestUnmatched.length < 20) accumulator.latestUnmatched.push(diagnosticItem);
        logShopifyPull("shopify_orders_backfill_line_unmatched", diagnosticItem, { runId, verboseOnly: true });
      }
      logShopifyPull(
        "shopify_orders_backfill_line_payout",
        {
          orderName: order.name || order.id,
          productTitle: match.artworkTitle || line.title,
          variantTitle: line.variantTitle || null,
          grossSalePrice: Number(line.lineTotal || 0),
          netSalePrice: payout.netSalePrice,
          payoutRate: payout.payoutRate,
          artistPayout: payout.artistPayout,
          payoutType: payout.payoutType,
        },
        { runId, verboseOnly: true },
      );

      return {
        lineId,
        productKey: match.productKey,
        title: match.artworkTitle || line.title,
        variantTitle: line.variantTitle || null,
        shopifyVariantId: line.variantId || null,
        shopifyVariantGid: line.variantId || null,
        quantity: remainingQuantity,
        unitPrice: Number(line.unitPrice || 0),
        lineTotal,
        refundedQuantity,
        refundedAmount,
        shopifyProductId: line.productId || null,
        shopifyProductGid: line.productId || null,
        productHandle: line.productHandle || null,
        vendor: line.vendor || null,
        productTags: Array.isArray(line.productTags) ? line.productTags : [],
        artistMetaobjectGid,
        inferredSaleType,
        canonicalProductId: match.canonicalProductId,
        canonicalArtistId: match.canonicalArtistId,
        artistShare: inferredSaleType === "unknown" ? undefined : payout.artistPayout,
        estimatedArtistShare: inferredSaleType === "unknown" ? 0 : undefined,
        payoutStatus,
      };
    });

    const allocations = buildAllocations(lines);

    await ShopifyOrderCacheModel.findOneAndUpdate(
      { shopifyOrderGid: order.id },
      {
        shopDomain,
        source: "shopify",
        shopifyOrderId: order.id,
        shopifyOrderGid: order.id,
        orderName: order.name || order.id,
        createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
        processedAt: order.processedAt ? new Date(order.processedAt) : undefined,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : undefined,
        refundedAmount: order.refundedAmount ?? order.refundedTotalGross ?? 0,
        refundedTotalGross: order.refundedTotalGross ?? 0,
        currency: order.currency || "EUR",
        totalGross: Number.isFinite(order.totalGross) ? order.totalGross : 0,
        lineItems: lines,
        allocations,
        lastImportedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    accumulator.importedOrdersCount += 1;
  }
}

export async function cacheShopifyFetchedOrders(params: {
  shopDomain?: string | null;
  orders: ShopifyOrder[];
  runId?: string;
}) {
  const shopDomain = resolveShopDomain(params.shopDomain);
  if (!shopDomain) throw new Error("missing_shopify_shop_domain");

  const context = await loadBackfillContext(shopDomain);
  const accumulator = createAccumulator();
  await persistFetchedOrders({
    shopDomain,
    orders: params.orders,
    context,
    runId: params.runId,
    accumulator,
  });

  return {
    ok: true as const,
    shopDomain,
    pageCount: 1,
    processedOrdersCount: accumulator.processedOrdersCount,
    importedOrdersCount: accumulator.importedOrdersCount,
    processedLineItemsCount: accumulator.processedLineItemsCount,
    matchedLineItemsCount: accumulator.matchedLineItemsCount,
    unmatchedLineItemsCount: accumulator.unmatchedLineItemsCount,
    skippedOrdersCount: accumulator.skippedOrdersCount,
    latestMatched: accumulator.latestMatched,
    latestUnmatched: accumulator.latestUnmatched,
  };
}

export async function backfillShopifyOrders(options: ShopifyOrdersBackfillOptions = {}): Promise<ShopifyOrdersBackfillResult> {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    throw new Error("missing_shopify_shop_domain");
  }

  const limitPerPage = Math.min(Math.max(1, Math.floor(options.limitPerPage || 100)), 100);
  const maxPages = Math.min(Math.max(1, Math.floor(options.maxPages || 10)), 100);
  const runId = options.runId;

  logShopifyPull(
    "shopify_orders_backfill_started",
    {
      shopDomain,
      limitPerPage,
      maxPages,
      since: options.since || null,
    },
    { runId, force: true },
  );

  const context = await loadBackfillContext(shopDomain);

  let after: string | null = null;
  let pageCount = 0;
  const accumulator = createAccumulator();

  while (pageCount < maxPages) {
    const result = await fetchShopifyOrders({ limit: limitPerPage, after, since: options.since || null });
    pageCount += 1;
    await persistFetchedOrders({ shopDomain, orders: result.orders, context, runId, accumulator });

    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    after = result.pageInfo.endCursor;
  }

  const summary: ShopifyOrdersBackfillResult = {
    ok: true,
    shopDomain,
    pageCount,
    processedOrdersCount: accumulator.processedOrdersCount,
    importedOrdersCount: accumulator.importedOrdersCount,
    processedLineItemsCount: accumulator.processedLineItemsCount,
    matchedLineItemsCount: accumulator.matchedLineItemsCount,
    unmatchedLineItemsCount: accumulator.unmatchedLineItemsCount,
    skippedOrdersCount: accumulator.skippedOrdersCount,
    latestMatched: accumulator.latestMatched,
    latestUnmatched: accumulator.latestUnmatched,
  };

  logShopifyPull(
    "shopify_orders_backfill_finished",
    {
      shopDomain,
      pageCount,
      processedOrdersCount: accumulator.processedOrdersCount,
      importedOrdersCount: accumulator.importedOrdersCount,
      processedLineItemsCount: accumulator.processedLineItemsCount,
      matchedLineItemsCount: accumulator.matchedLineItemsCount,
      unmatchedLineItemsCount: accumulator.unmatchedLineItemsCount,
      skippedOrdersCount: accumulator.skippedOrdersCount,
    },
    { runId, force: true },
  );

  return summary;
}

export async function getShopifyOrdersDiagnostics(params?: { limit?: number; since?: string; until?: string }) {
  function parseDate(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const limit = Math.min(Math.max(1, Math.floor(params?.limit || 20)), 100);
  const since = parseDate(params?.since);
  const until = parseDate(params?.until);
  const shopDomain = resolveShopDomain();
  const [cachedOrdersCount, latestOrders, syncStates] = await Promise.all([
    ShopifyOrderCacheModel.countDocuments({}),
    ShopifyOrderCacheModel.find({})
      .sort({ createdAt: -1, updatedAt: -1 })
      .limit(limit)
      .select({
        _id: 1,
        shopDomain: 1,
        shopifyOrderGid: 1,
        orderName: 1,
        createdAt: 1,
        financialStatus: 1,
        fulfillmentStatus: 1,
        cancelledAt: 1,
        refundedTotalGross: 1,
        totalGross: 1,
        currency: 1,
        lineItems: 1,
        lastImportedAt: 1,
      })
      .lean(),
    shopDomain
      ? SyncStateModel.find({
          shopDomain,
          scope: { $in: ["shopify_orders_webhook", "shopify_orders_sync"] },
        })
          .select({ scope: 1, lastRunAt: 1, lastSuccessAt: 1, lastError: 1 })
          .lean()
      : [],
  ]);

  const matchedOrderItems: Array<Record<string, unknown>> = [];
  const unmatchedOrderItems: Array<Record<string, unknown>> = [];
  const artistEarningsRelevantLineItems: Array<Record<string, unknown>> = [];
  let totalCachedRevenue = 0;
  let analyticsRevenue = 0;

  for (const order of latestOrders) {
    const countable = isCountableShopifyOrder(order);
    const createdAt = order.createdAt ? new Date(order.createdAt) : null;
    const inRange = (!since || (createdAt && createdAt >= since)) && (!until || (createdAt && createdAt <= until));
    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    let orderRevenue = 0;
    for (const line of lineItems) {
      const lineGross = Number(line.lineTotal || 0);
      orderRevenue += lineGross;
      const item = {
        shopifyOrderId: order.shopifyOrderGid,
        orderName: order.orderName,
        financialStatus: order.financialStatus || null,
        fulfillmentStatus: order.fulfillmentStatus || null,
        productKey: line.productKey || null,
        title: line.title || null,
        variantTitle: line.variantTitle || null,
        shopifyProductId: line.shopifyProductId || line.shopifyProductGid || null,
        shopifyVariantId: line.shopifyVariantId || line.shopifyVariantGid || null,
        productHandle: line.productHandle || null,
        canonicalProductId: line.canonicalProductId ? String(line.canonicalProductId) : null,
        canonicalArtistId: line.canonicalArtistId ? String(line.canonicalArtistId) : null,
        artistShare: line.artistShare ?? null,
        estimatedArtistShare: line.estimatedArtistShare ?? null,
        payoutStatus: line.payoutStatus || null,
      };

      if (line.canonicalArtistId) matchedOrderItems.push(item);
      else unmatchedOrderItems.push(item);
      if (countable && line.canonicalArtistId) {
        artistEarningsRelevantLineItems.push(item);
      }
    }

    if (countable) {
      totalCachedRevenue += orderRevenue || Number(order.totalGross || 0);
      if (inRange) analyticsRevenue += orderRevenue || Number(order.totalGross || 0);
    }
  }

  const webhookState = syncStates.find((state) => state.scope === "shopify_orders_webhook") || null;
  const workerState = syncStates.find((state) => state.scope === "shopify_orders_sync") || null;
  const lastOrderSyncAt = [webhookState?.lastRunAt, workerState?.lastSuccessAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const errors = syncStates
    .filter((state) => state.lastError)
    .map((state) => ({
      scope: state.scope,
      lastError: state.lastError || null,
      lastRunAt: state.lastRunAt ? new Date(state.lastRunAt).toISOString() : null,
      lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
    }));
  const lastSyncError = errors[0]?.lastError || null;

  return {
    range: {
      since: since ? since.toISOString() : null,
      until: until ? until.toISOString() : null,
    },
    cachedOrdersCount,
    lastOrderSyncAt: lastOrderSyncAt ? new Date(lastOrderSyncAt).toISOString() : null,
    latestWebhookReceivedAt: webhookState?.lastRunAt ? new Date(webhookState.lastRunAt).toISOString() : null,
    latestWorkerSyncAt: workerState?.lastSuccessAt ? new Date(workerState.lastSuccessAt).toISOString() : null,
    lastSyncError,
    totals: {
      totalCachedRevenue,
      analyticsRevenue,
    },
    latestCachedOrders: latestOrders.map((order) => ({
      id: String(order._id),
      shopDomain: order.shopDomain || null,
      shopifyOrderId: order.shopifyOrderGid,
      orderName: order.orderName,
      createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
      financialStatus: order.financialStatus || null,
      fulfillmentStatus: order.fulfillmentStatus || null,
      cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
      refundedTotalGross: Number(order.refundedTotalGross || 0),
      totalGross: Number(order.totalGross || 0),
      currency: order.currency || "EUR",
      lineItemCount: Array.isArray(order.lineItems) ? order.lineItems.length : 0,
      lastImportedAt: order.lastImportedAt ? new Date(order.lastImportedAt).toISOString() : null,
    })),
    latestOrders: latestOrders.map((order) => ({
      id: String(order._id),
      shopDomain: order.shopDomain || null,
      shopifyOrderId: order.shopifyOrderGid,
      orderName: order.orderName,
      createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : null,
      financialStatus: order.financialStatus || null,
      fulfillmentStatus: order.fulfillmentStatus || null,
      cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
      refundedTotalGross: Number(order.refundedTotalGross || 0),
      totalGross: Number(order.totalGross || 0),
      currency: order.currency || "EUR",
      lineItemCount: Array.isArray(order.lineItems) ? order.lineItems.length : 0,
      lastImportedAt: order.lastImportedAt ? new Date(order.lastImportedAt).toISOString() : null,
    })),
    matchedLineItemsCount: matchedOrderItems.length,
    unmatchedLineItemsCount: unmatchedOrderItems.length,
    matchedOrderItems: matchedOrderItems.slice(0, limit),
    unmatchedOrderItems: unmatchedOrderItems.slice(0, limit),
    artistEarningsRelevantLineItems: artistEarningsRelevantLineItems.slice(0, limit),
    matchedLineItems: matchedOrderItems.slice(0, limit),
    unmatchedLineItems: unmatchedOrderItems.slice(0, limit),
    errors,
  };
}
