import { Types } from "mongoose";

import { fetchShopifyOrders, type ShopifyOrder, type ShopifyOrderLine } from "@/lib/shopifyOrders";
import { resolveShopDomain } from "@/lib/shopDomain";
import { logShopifyPull } from "@/lib/sync/syncLogger";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";
import { ContractTermsModel } from "@/models/ContractTerms";
import { orderSaleTypes, ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";

type InferredSaleType = (typeof orderSaleTypes)[number];
type PayoutStatus = "pending" | "eligible" | "paid" | "refunded" | "cancelled";

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
  legacyArtistId?: string | null;
  shopifyMetaobjectId?: string | null;
  shopify?: {
    metaobjectGid?: string | null;
  };
};

type BackfillTerms = {
  kunstlerId: string;
  printCommissionPct: number;
  originalCommissionPct: number;
};

type MatchResult = {
  canonicalProductId: Types.ObjectId | null;
  canonicalArtistId: Types.ObjectId | null;
  productKey: string | null;
  artworkTitle: string | null;
  productRecord: BackfillProduct | null;
  matchedBy: "variant" | "product" | "handle" | "none";
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
  shopifyProductId: string | null;
  shopifyProductGid: string | null;
  productHandle: string | null;
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
  variantTitle: string | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  productHandle: string | null;
  canonicalProductId: string | null;
  canonicalArtistId: string | null;
  matchedBy: MatchResult["matchedBy"];
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

function normalizeFinancialStatus(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function isPaidFinancialStatus(status: string) {
  return status.includes("paid");
}

function isCancelledOrder(order: Pick<ShopifyOrder, "cancelledAt" | "financialStatus">) {
  const status = normalizeFinancialStatus(order.financialStatus);
  return Boolean(order.cancelledAt) || status.includes("cancelled") || status.includes("voided");
}

function isFullyRefundedOrder(order: Pick<ShopifyOrder, "financialStatus" | "refundedTotalGross" | "totalGross">) {
  const status = normalizeFinancialStatus(order.financialStatus);
  const refundedGross = Number(order.refundedTotalGross || 0);
  const totalGross = Number(order.totalGross || 0);
  if (refundedGross > 0 && totalGross > 0 && refundedGross + 0.01 >= totalGross) return true;
  return status.includes("refunded") && refundedGross > 0 && (totalGross === 0 || refundedGross + 0.01 >= totalGross);
}

function inferSaleType(line: ShopifyOrderLine, matchedProduct: BackfillProduct | null): InferredSaleType {
  const lowerTags = (line.productTags || []).map((tag) => tag.toLowerCase());
  const variantTitle = (line.variantTitle || "").toLowerCase();
  if (variantTitle.includes("print")) return "print";
  if (variantTitle.includes("original") || variantTitle.includes("unikat")) return "original";
  if (lowerTags.includes("original")) return "original";
  if (matchedProduct?.offerings === "prints_only") return "print";
  if (matchedProduct?.offerings === "original_only") return "original";
  if (matchedProduct?.allowPrints && !matchedProduct?.originalAvailable) return "print";
  if (matchedProduct?.originalAvailable && !matchedProduct?.allowPrints) return "original";
  if (lowerTags.length > 0) return "print";
  return "unknown";
}

function calculateArtistShare(params: {
  salePrice: number;
  saleType: InferredSaleType;
  terms: BackfillTerms | null;
}) {
  if (!params.terms) {
    return { artistShare: undefined, estimatedArtistShare: toMoney(params.salePrice) };
  }

  if (params.saleType === "print") {
    return {
      artistShare: toMoney(params.salePrice * (params.terms.printCommissionPct / 100)),
      estimatedArtistShare: undefined,
    };
  }

  if (params.saleType === "original") {
    return {
      artistShare: toMoney(params.salePrice * (params.terms.originalCommissionPct / 100)),
      estimatedArtistShare: undefined,
    };
  }

  return {
    artistShare: undefined,
    estimatedArtistShare: toMoney(params.salePrice * (params.terms.originalCommissionPct / 100)),
  };
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
      .select({ _id: 1, legacyArtistId: 1, shopifyMetaobjectId: 1, "shopify.metaobjectGid": 1 })
      .lean<BackfillArtist[]>(),
  ]);

  const legacyIds = artists.map((artist) => artist.legacyArtistId).filter((value): value is string => Boolean(value));
  const terms = legacyIds.length
    ? await ContractTermsModel.find({ kunstlerId: { $in: legacyIds } })
        .select({ kunstlerId: 1, printCommissionPct: 1, originalCommissionPct: 1 })
        .lean<BackfillTerms[]>()
    : [];

  const productByVariantGid = new Map<string, MatchResult>();
  const productByProductGid = new Map<string, MatchResult>();
  const productByHandle = new Map<string, MatchResult>();
  const artistById = new Map<string, BackfillArtist>();
  const termsByArtistId = new Map<string, BackfillTerms>();
  const productById = new Map<string, BackfillProduct>();

  for (const artist of artists) {
    artistById.set(String(artist._id), artist);
  }

  for (const term of terms) {
    const artist = artists.find((candidate) => candidate.legacyArtistId === term.kunstlerId);
    if (!artist) continue;
    termsByArtistId.set(String(artist._id), term);
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

  return { productByVariantGid, productByProductGid, productByHandle, artistById, termsByArtistId };
}

function matchLineItem(params: {
  line: ShopifyOrderLine;
  productByVariantGid: Map<string, MatchResult>;
  productByProductGid: Map<string, MatchResult>;
  productByHandle: Map<string, MatchResult>;
}): MatchResult {
  const variantKey = params.line.variantId?.trim();
  if (variantKey) {
    const matched = params.productByVariantGid.get(variantKey);
    if (matched) return matched;
  }

  const productKey = params.line.productId?.trim();
  if (productKey) {
    const matched = params.productByProductGid.get(productKey);
    if (matched) return matched;
  }

  const handle = params.line.productHandle?.trim().toLowerCase();
  if (handle) {
    const matched = params.productByHandle.get(handle);
    if (matched) return matched;
  }

  return {
    canonicalProductId: null,
    canonicalArtistId: null,
    productKey: null,
    artworkTitle: null,
    productRecord: null,
    matchedBy: "none",
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

  const { productByVariantGid, productByProductGid, productByHandle, artistById, termsByArtistId } = await loadBackfillContext(shopDomain);

  let after: string | null = null;
  let pageCount = 0;
  let processedOrdersCount = 0;
  let importedOrdersCount = 0;
  let processedLineItemsCount = 0;
  let matchedLineItemsCount = 0;
  let unmatchedLineItemsCount = 0;
  let skippedOrdersCount = 0;

  const latestMatched: BackfillDiagnosticsItem[] = [];
  const latestUnmatched: BackfillDiagnosticsItem[] = [];

  while (pageCount < maxPages) {
    const result = await fetchShopifyOrders({ limit: limitPerPage, after, since: options.since || null });
    pageCount += 1;

    for (const order of result.orders) {
      processedOrdersCount += 1;

      const normalizedFinancialStatus = normalizeFinancialStatus(order.financialStatus);
      const cancelled = isCancelledOrder(order);
      const fullyRefunded = isFullyRefundedOrder(order);
      const countableSale = isPaidFinancialStatus(normalizedFinancialStatus);

      if (!countableSale && !cancelled && !fullyRefunded) {
        skippedOrdersCount += 1;
        continue;
      }

      const lines: BackfillLineItem[] = order.lineItems.map((line, index) => {
        processedLineItemsCount += 1;
        const match = matchLineItem({
          line,
          productByVariantGid,
          productByProductGid,
          productByHandle,
        });
        const artistId = match.canonicalArtistId ? String(match.canonicalArtistId) : null;
        const artist = artistId ? artistById.get(artistId) || null : null;
        const terms = artistId ? termsByArtistId.get(artistId) || null : null;
        const lineTotal = Number(line.lineTotal || 0);
        const inferredSaleType = inferSaleType(line, match.productRecord);
        const share = calculateArtistShare({ salePrice: lineTotal, saleType: inferredSaleType, terms });
        const payoutStatus: PayoutStatus = cancelled ? "cancelled" : fullyRefunded ? "refunded" : "pending";
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
          variantTitle: line.variantTitle || null,
          shopifyProductId: line.productId || null,
          shopifyVariantId: line.variantId || null,
          productHandle: line.productHandle || null,
          canonicalProductId: match.canonicalProductId ? String(match.canonicalProductId) : null,
          canonicalArtistId: match.canonicalArtistId ? String(match.canonicalArtistId) : null,
          matchedBy: match.matchedBy,
        };

        if (match.canonicalArtistId && match.canonicalProductId) {
          matchedLineItemsCount += 1;
          if (latestMatched.length < 20) latestMatched.push(diagnosticItem);
        } else {
          unmatchedLineItemsCount += 1;
          if (latestUnmatched.length < 20) latestUnmatched.push(diagnosticItem);
          logShopifyPull(
            "shopify_orders_backfill_line_unmatched",
            diagnosticItem,
            { runId, verboseOnly: true },
          );
        }

        return {
          lineId,
          productKey: match.productKey,
          title: match.artworkTitle || line.title,
          variantTitle: line.variantTitle || null,
          shopifyVariantId: line.variantId || null,
          shopifyVariantGid: line.variantId || null,
          quantity: Number(line.quantity || 0),
          unitPrice: Number(line.unitPrice || 0),
          lineTotal,
          shopifyProductId: line.productId || null,
          shopifyProductGid: line.productId || null,
          productHandle: line.productHandle || null,
          productTags: Array.isArray(line.productTags) ? line.productTags : [],
          artistMetaobjectGid,
          inferredSaleType,
          canonicalProductId: match.canonicalProductId,
          canonicalArtistId: match.canonicalArtistId,
          artistShare: share.artistShare,
          estimatedArtistShare: share.estimatedArtistShare,
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
          refundedTotalGross: order.refundedTotalGross ?? 0,
          currency: order.currency || "EUR",
          totalGross: Number.isFinite(order.totalGross) ? order.totalGross : 0,
          lineItems: lines,
          allocations,
          lastImportedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      importedOrdersCount += 1;
    }

    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    after = result.pageInfo.endCursor;
  }

  const summary: ShopifyOrdersBackfillResult = {
    ok: true,
    shopDomain,
    pageCount,
    processedOrdersCount,
    importedOrdersCount,
    processedLineItemsCount,
    matchedLineItemsCount,
    unmatchedLineItemsCount,
    skippedOrdersCount,
    latestMatched,
    latestUnmatched,
  };

  logShopifyPull(
    "shopify_orders_backfill_finished",
    {
      shopDomain,
      pageCount,
      processedOrdersCount,
      importedOrdersCount,
      processedLineItemsCount,
      matchedLineItemsCount,
      unmatchedLineItemsCount,
      skippedOrdersCount,
    },
    { runId, force: true },
  );

  return summary;
}

export async function getShopifyOrdersDiagnostics(params?: { limit?: number }) {
  const limit = Math.min(Math.max(1, Math.floor(params?.limit || 20)), 100);
  const latestOrders = await ShopifyOrderCacheModel.find({})
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
    .lean();

  const matchedOrderItems: Array<Record<string, unknown>> = [];
  const unmatchedOrderItems: Array<Record<string, unknown>> = [];

  for (const order of latestOrders) {
    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    for (const line of lineItems) {
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

      if (line.canonicalArtistId && line.canonicalProductId) matchedOrderItems.push(item);
      else unmatchedOrderItems.push(item);
    }
  }

  return {
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
    matchedOrderItems: matchedOrderItems.slice(0, limit),
    unmatchedOrderItems: unmatchedOrderItems.slice(0, limit),
  };
}
