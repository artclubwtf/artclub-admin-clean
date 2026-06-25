import { Types } from "mongoose";

import { computeArtistPayout, computeRemainingGross, computeRemainingQuantity } from "./artistPayouts";
import { ArtistModel } from "../models/Artist";
import { CanonicalArtistModel } from "../models/CanonicalArtist";
import { OrderLineOverrideModel } from "../models/OrderLineOverride";
import { PosOrderModel } from "../models/PosOrder";
import { ShopifyOrderCacheModel } from "../models/ShopifyOrderCache";
import { connectMongo } from "./mongodb";
import {
  isCancelledShopifyOrder,
  isCountableShopifyOrder,
  isFullyRefundedShopifyOrder,
  isPaidShopifyFinancialStatus,
  normalizeShopifyFinancialStatus,
  normalizeShopifyOrderStatus,
} from "./shopifyOrderStatus";
import { logShopifyDiagnostics } from "./sync/syncLogger";

export type ArtistOrderIdentity = {
  adminArtistId: string | null;
  canonicalArtistId: string | null;
  legacyArtistId: string | null;
  artistMetaobjectGids: string[];
};

export type ArtistOrderEntry = {
  id: string;
  source: "shopify" | "pos";
  createdAt: string;
  label: string;
  currency: string;
  printGross: number;
  originalGross: number;
  unknownGross: number;
};

export type ArtistOrderSaleLine = {
  source: "shopify" | "pos";
  orderId: string;
  createdAt: string;
  label: string;
  currency: string;
  orderStatus: "paid" | "pending" | "refunded" | "cancelled";
  payoutStatus: "pending" | "eligible" | "paid" | "partially_refunded" | "refunded" | "cancelled";
  productKey: string;
  artworkTitle: string;
  variantTitle: string | null;
  quantity: number;
  salePrice: number;
  artistShare: number;
  artistShareIsEstimated: boolean;
  saleType: "print" | "original" | "unknown";
  refundedAmount: number;
  refundedQuantity: number;
};

export type ArtistOrderSalesResult = {
  identity: ArtistOrderIdentity;
  orders: ArtistOrderEntry[];
  saleLines: ArtistOrderSaleLine[];
};

type LoadArtistOrderSalesParams = {
  adminArtistId?: string | null;
  canonicalArtistId?: string | null;
  linkedUserId?: Types.ObjectId | string | null;
  shopDomain?: string | null;
  includeUnpaid?: boolean;
  includeCancelled?: boolean;
};

function uniqNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value || "").trim()).filter(Boolean)));
}

function toObjectId(value: string | null) {
  return value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
}

async function resolveArtistOrderIdentity(params: LoadArtistOrderSalesParams): Promise<ArtistOrderIdentity> {
  await connectMongo();

  if (params.adminArtistId) {
    const artist = await ArtistModel.findById(params.adminArtistId)
      .select({ _id: 1, name: 1, "shopifySync.metaobjectId": 1 })
      .lean();
    if (!artist) {
      return {
        adminArtistId: params.adminArtistId,
        canonicalArtistId: null,
        legacyArtistId: params.adminArtistId,
        artistMetaobjectGids: [],
      };
    }

    const metaobjectId = artist.shopifySync?.metaobjectId?.trim() || null;
    const canonicalArtist = await CanonicalArtistModel.findOne({
      $or: [
        { legacyArtistId: String(artist._id) },
        ...(metaobjectId ? [{ shopifyMetaobjectId: metaobjectId }, { "shopify.metaobjectGid": metaobjectId }] : []),
      ],
    })
      .select({ _id: 1, legacyArtistId: 1, shopifyMetaobjectId: 1, "shopify.metaobjectGid": 1 })
      .lean();

    return {
      adminArtistId: String(artist._id),
      canonicalArtistId: canonicalArtist?._id ? String(canonicalArtist._id) : null,
      legacyArtistId: canonicalArtist?.legacyArtistId?.trim() || String(artist._id),
      artistMetaobjectGids: uniqNonEmpty([metaobjectId, canonicalArtist?.shopifyMetaobjectId, canonicalArtist?.shopify?.metaobjectGid]),
    };
  }

  let canonicalArtistQuery: Record<string, unknown> | null = null;
  if (params.canonicalArtistId) {
    canonicalArtistQuery = { _id: params.canonicalArtistId };
  } else if (params.linkedUserId && params.shopDomain) {
    canonicalArtistQuery = {
      linkedUserId: params.linkedUserId,
      shopDomain: params.shopDomain,
    };
  }

  if (!canonicalArtistQuery) {
    return {
      adminArtistId: null,
      canonicalArtistId: null,
      legacyArtistId: null,
      artistMetaobjectGids: [],
    };
  }

  const canonicalArtist = await CanonicalArtistModel.findOne(canonicalArtistQuery)
    .select({ _id: 1, legacyArtistId: 1, shopifyMetaobjectId: 1, "shopify.metaobjectGid": 1 })
    .lean();

  return {
    adminArtistId: canonicalArtist?.legacyArtistId?.trim() || null,
    canonicalArtistId: canonicalArtist?._id ? String(canonicalArtist._id) : null,
    legacyArtistId: canonicalArtist?.legacyArtistId?.trim() || null,
    artistMetaobjectGids: uniqNonEmpty([canonicalArtist?.shopifyMetaobjectId, canonicalArtist?.shopify?.metaobjectGid]),
  };
}

export async function loadArtistOrderSales(params: LoadArtistOrderSalesParams): Promise<ArtistOrderSalesResult> {
  const identity = await resolveArtistOrderIdentity(params);
  const includeUnpaid = params.includeUnpaid === true;
  const includeCancelled = params.includeCancelled === true;
  const canonicalObjectId = toObjectId(identity.canonicalArtistId);
  const legacyArtistIds = uniqNonEmpty([identity.adminArtistId, identity.legacyArtistId]);
  const metaobjectIds = identity.artistMetaobjectGids;

  const shopifyOr: Record<string, unknown>[] = [];
  if (metaobjectIds.length > 0) {
    shopifyOr.push(
      { "allocations.artistMetaobjectGid": { $in: metaobjectIds } },
      { "lineItems.artistMetaobjectGid": { $in: metaobjectIds } },
    );
  }
  if (canonicalObjectId) {
    shopifyOr.push({ "lineItems.canonicalArtistId": canonicalObjectId });
  }

  const posOr: Record<string, unknown>[] = [];
  if (metaobjectIds.length > 0) {
    posOr.push({ "lineItems.artistShopifyMetaobjectGid": { $in: metaobjectIds } });
  }
  if (legacyArtistIds.length > 0) {
    posOr.push({ "lineItems.artistMongoId": { $in: legacyArtistIds } });
  }

  const [shopifyOrders, posOrders] = await Promise.all([
    shopifyOr.length > 0 ? ShopifyOrderCacheModel.find({ $or: shopifyOr }).sort({ createdAt: -1 }).lean() : [],
    posOr.length > 0 ? PosOrderModel.find({ $or: posOr }).sort({ createdAt: -1 }).lean() : [],
  ]);

  const [shopifyOverrides, posOverrides] = await Promise.all([
    shopifyOrders.length > 0
      ? OrderLineOverrideModel.find({
          orderSource: "shopify",
          shopifyOrderGid: { $in: shopifyOrders.map((doc) => doc.shopifyOrderGid).filter(Boolean) },
        }).lean()
      : [],
    posOrders.length > 0
      ? OrderLineOverrideModel.find({
          orderSource: "pos",
          posOrderId: { $in: posOrders.map((doc) => String(doc._id)).filter(Boolean) },
        }).lean()
      : [],
  ]);

  const shopifyOverrideMap = new Map<string, (typeof shopifyOverrides)[number]>();
  shopifyOverrides.forEach((override) => {
    if (override.lineKey) {
      shopifyOverrideMap.set(`${override.shopifyOrderGid}:${override.lineKey}`, override);
    }
  });

  const posOverrideMap = new Map<string, (typeof posOverrides)[number]>();
  posOverrides.forEach((override) => {
    if (override.lineKey) {
      posOverrideMap.set(`${override.posOrderId}:${override.lineKey}`, override);
    }
  });

  const orders: ArtistOrderEntry[] = [];
  const saleLines: ArtistOrderSaleLine[] = [];
  const metaobjectIdSet = new Set(metaobjectIds);
  const canonicalArtistId = identity.canonicalArtistId;
  const legacyArtistIdSet = new Set(legacyArtistIds);

  for (const doc of shopifyOrders) {
    const normalizedFinancialStatus = normalizeShopifyFinancialStatus(doc.financialStatus);
    const isPaid = isPaidShopifyFinancialStatus(normalizedFinancialStatus);
    const isCancelled = isCancelledShopifyOrder(doc);
    const fullyRefunded = isFullyRefundedShopifyOrder(doc);
    const countableSale = isCountableShopifyOrder(doc);
    if (!includeUnpaid && !countableSale && !isPaid) continue;
    if (!includeCancelled && (isCancelled || fullyRefunded)) continue;

    const orderStatus = normalizeShopifyOrderStatus(doc);
    const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
    const label = doc.orderName || doc.shopifyOrderGid || "Order";
    const currency = doc.currency || "EUR";
    const lineItems: any[] = Array.isArray(doc.lineItems) ? doc.lineItems : [];

    let printGross = 0;
    let originalGross = 0;
    let unknownGross = 0;

    lineItems.forEach((line, index) => {
      const lineKey = line.lineId || line.id || `${doc.shopifyOrderGid}:line:${index}`;
      const override = shopifyOverrideMap.get(`${doc.shopifyOrderGid}:${lineKey}`);
      const overrideMetaobject = override?.overrideArtistMetaobjectGid;
      const metaobjectMatch =
        overrideMetaobject !== undefined
          ? metaobjectIdSet.has(overrideMetaobject || "")
          : metaobjectIdSet.has(line.artistMetaobjectGid || "");
      const canonicalMatch = canonicalArtistId ? String(line.canonicalArtistId || "") === canonicalArtistId : false;
      if (!metaobjectMatch && !canonicalMatch) return;

      const saleType = (override?.overrideSaleType || line.inferredSaleType || "unknown") as ArtistOrderSaleLine["saleType"];
      const gross = Number(override?.overrideGross !== undefined ? override.overrideGross : line.lineTotal || 0);
      const refundedAmount = Number(line.refundedAmount || 0);
      const refundedQuantity = Number(line.refundedQuantity || 0);
      const remainingGross = computeRemainingGross(gross, refundedAmount);
      const remainingQuantity = computeRemainingQuantity(line.quantity, refundedQuantity);
      const payout = computeArtistPayout(remainingGross, saleType);
      if (saleType === "print") printGross += remainingGross;
      else if (saleType === "original") originalGross += remainingGross;
      else unknownGross += remainingGross;

      logShopifyDiagnostics(
        "artist_order_sales_line_payout",
        {
          orderName: label,
          productTitle: line.title || "Untitled artwork",
          variantTitle: line.variantTitle || null,
          grossSalePrice: payout.grossSalePrice,
          netSalePrice: payout.netSalePrice,
          payoutRate: payout.payoutRate,
          artistPayout: payout.artistPayout,
          payoutType: payout.payoutType,
        },
        { verboseOnly: true },
      );

      saleLines.push({
        source: "shopify",
        orderId: doc.shopifyOrderGid || String(doc._id),
        createdAt,
        label,
        currency,
        orderStatus,
        payoutStatus:
          orderStatus === "refunded"
            ? "refunded"
            : orderStatus === "cancelled"
              ? "cancelled"
              : ((line.payoutStatus as ArtistOrderSaleLine["payoutStatus"] | undefined) || "pending"),
        productKey: line.productKey || "",
        artworkTitle: line.title || "Untitled artwork",
        variantTitle: line.variantTitle || null,
        quantity: remainingQuantity,
        salePrice: remainingGross,
        artistShare: payout.artistPayout,
        artistShareIsEstimated: saleType === "unknown",
        saleType,
        refundedAmount,
        refundedQuantity,
      });
    });

    if (printGross + originalGross + unknownGross === 0) continue;
    orders.push({
      id: String(doc._id || doc.shopifyOrderGid),
      source: "shopify",
      createdAt,
      label,
      currency,
      printGross,
      originalGross,
      unknownGross,
    });
  }

  for (const doc of posOrders) {
    const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
    const label = doc.note || "POS order";
    const currency = doc.totals?.currency || "EUR";
    const lineItems: any[] = Array.isArray(doc.lineItems) ? doc.lineItems : [];

    let printGross = 0;
    let originalGross = 0;
    let unknownGross = 0;

    lineItems.forEach((line, index) => {
      const lineKey = line.lineId || line.id || `pos:${doc._id}:line:${index}`;
      const override = posOverrideMap.get(`${doc._id}:${lineKey}`);
      const overrideMetaobject = override?.overrideArtistMetaobjectGid;
      const metaobjectMatch =
        overrideMetaobject !== undefined
          ? metaobjectIdSet.has(overrideMetaobject || "")
          : metaobjectIdSet.has(line.artistShopifyMetaobjectGid || "");
      const legacyMatch = legacyArtistIdSet.has(String(line.artistMongoId || ""));
      if (!metaobjectMatch && !legacyMatch) return;

      const saleType = (override?.overrideSaleType || line.saleType || "unknown") as ArtistOrderSaleLine["saleType"];
      const gross = Number(override?.overrideGross !== undefined ? override.overrideGross : Number(line.quantity || 0) * Number(line.unitPrice || 0));
      const payout = computeArtistPayout(gross, saleType);
      if (saleType === "print") printGross += gross;
      else if (saleType === "original") originalGross += gross;
      else unknownGross += gross;

      logShopifyDiagnostics(
        "artist_order_sales_line_payout",
        {
          orderName: label,
          productTitle: line.title || "Untitled artwork",
          variantTitle: null,
          grossSalePrice: payout.grossSalePrice,
          netSalePrice: payout.netSalePrice,
          payoutRate: payout.payoutRate,
          artistPayout: payout.artistPayout,
          payoutType: payout.payoutType,
        },
        { verboseOnly: true },
      );

      saleLines.push({
        source: "pos",
        orderId: String(doc._id),
        createdAt,
        label,
        currency,
        orderStatus: "paid",
        payoutStatus: "pending",
        productKey: line.shopifyProductGid || "",
        artworkTitle: line.title || "Untitled artwork",
        variantTitle: null,
        quantity: Number(line.quantity || 0),
        salePrice: gross,
        artistShare: payout.artistPayout,
        artistShareIsEstimated: saleType === "unknown",
        saleType,
        refundedAmount: 0,
        refundedQuantity: 0,
      });
    });

    if (printGross + originalGross + unknownGross === 0) continue;
    orders.push({
      id: String(doc._id),
      source: "pos",
      createdAt,
      label,
      currency,
      printGross,
      originalGross,
      unknownGross,
    });
  }

  return {
    identity,
    orders: orders.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    saleLines,
  };
}
