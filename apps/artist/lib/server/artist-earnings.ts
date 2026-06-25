import type { ArtistEarningsOrderStatus, ArtistEarningsPayoutStatus, ArtistEarningsResponse } from "@artclub/models";

import { artistEarningsResponse } from "@artclub/models";

import type { ArtistContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import {
  CanonicalArtistModel,
  CanonicalProductModel,
  ContractTermsModel,
  OrderLineOverrideModel,
  PayoutTransactionModel,
  ShopifyOrderCacheModel,
} from "@/lib/server/models";
import { logArtistEarnings } from "../../../admin/lib/sync/syncLogger";

type ProductRecord = {
  productKey: string;
  title: string;
  offerings?: string;
  allowPrints?: boolean;
  originalAvailable?: boolean;
  shopifyProductGid?: string | null;
};

type SaleRecord = {
  orderDate: string;
  artworkTitle: string;
  variantTitle: string | null;
  quantity: number;
  salePrice: number;
  artistShare: number;
  artistShareIsEstimated: boolean;
  payoutStatus: ArtistEarningsPayoutStatus;
  orderStatus: ArtistEarningsOrderStatus;
  productKey: string;
};

type ContractTerms = {
  printCommissionPct: number;
  originalCommissionPct: number;
};

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function normalizeOrderStatus(input: { financialStatus?: string | null; cancelledAt?: Date | null; refundedTotalGross?: number | null }) {
  if (input.cancelledAt) return "cancelled" as const;

  const financialStatus = (input.financialStatus || "").trim().toLowerCase();
  if (financialStatus.includes("refund")) return "refunded" as const;
  if ((input.refundedTotalGross || 0) > 0 && financialStatus.includes("partially")) return "paid" as const;
  if ((input.refundedTotalGross || 0) > 0 && !financialStatus) return "paid" as const;
  if ((input.refundedTotalGross || 0) > 0 && financialStatus.includes("paid")) return "paid" as const;
  if (financialStatus.includes("paid")) return "paid" as const;
  return "pending" as const;
}

function inferSaleType(input: {
  rawSaleType?: string | null;
  variantTitle?: string | null;
  product?: Pick<ProductRecord, "offerings" | "allowPrints" | "originalAvailable"> | null;
}) {
  const raw = (input.rawSaleType || "").trim().toLowerCase();
  if (raw === "print" || raw === "original") return raw;

  const variantTitle = (input.variantTitle || "").trim().toLowerCase();
  if (variantTitle.includes("print")) return "print" as const;
  if (variantTitle.includes("original") || variantTitle.includes("unikat")) return "original" as const;

  if (input.product?.offerings === "prints_only") return "print" as const;
  if (input.product?.offerings === "original_only") return "original" as const;
  if (input.product?.allowPrints && !input.product?.originalAvailable) return "print" as const;
  if (input.product?.originalAvailable && !input.product?.allowPrints) return "original" as const;

  return "unknown" as const;
}

function calculateArtistShare(params: {
  salePrice: number;
  saleType: "print" | "original" | "unknown";
  terms: ContractTerms | null;
}) {
  if (!params.terms) {
    return {
      amount: toMoney(params.salePrice),
      isEstimated: true,
    };
  }

  if (params.saleType === "print") {
    return {
      amount: toMoney(params.salePrice * (params.terms.printCommissionPct / 100)),
      isEstimated: false,
    };
  }

  if (params.saleType === "original") {
    return {
      amount: toMoney(params.salePrice * (params.terms.originalCommissionPct / 100)),
      isEstimated: false,
    };
  }

  return {
    amount: toMoney(params.salePrice * (params.terms.originalCommissionPct / 100)),
    isEstimated: true,
  };
}

function buildEmptyResponse(): ArtistEarningsResponse {
  return artistEarningsResponse.parse({
    currency: "EUR",
    totalSalesAmount: 0,
    soldItemsCount: 0,
    estimatedArtistEarnings: 0,
    pendingPayoutAmount: 0,
    paidOutAmount: 0,
    refundedAmount: 0,
    salesByMonth: [],
    earningsByMonth: [],
    bestSellingArtworks: [],
    recentSales: [],
  });
}

function finalizeEarningsResponse(context: ArtistContext, response: ArtistEarningsResponse) {
  logArtistEarnings(
    "artist_earnings_loaded",
    {
      canonicalArtistId: String(context.canonicalArtist._id),
      soldItemsCount: response.soldItemsCount,
      totalSalesAmount: response.totalSalesAmount,
      estimatedArtistEarnings: response.estimatedArtistEarnings,
    },
    { force: true },
  );

  return response;
}

export async function loadArtistEarnings(context: ArtistContext): Promise<ArtistEarningsResponse> {
  await connectMongo();

  const canonicalArtist = await CanonicalArtistModel.findOne({
    _id: context.canonicalArtist._id,
    shopDomain: context.user.shopDomain,
  })
    .select({
      _id: 1,
      legacyArtistId: 1,
      shopifyMetaobjectId: 1,
      "shopify.metaobjectGid": 1,
    })
    .lean();

  if (!canonicalArtist) {
    return finalizeEarningsResponse(context, buildEmptyResponse());
  }

  const [products, terms] = await Promise.all([
    CanonicalProductModel.find({
      shopDomain: context.user.shopDomain,
      canonicalArtistId: context.canonicalArtist._id,
      type: "artwork",
      "shopify.productGid": { $exists: true, $type: "string" },
    })
      .select({
        productKey: 1,
        title: 1,
        offerings: 1,
        allowPrints: 1,
        originalAvailable: 1,
        "shopify.productGid": 1,
      })
      .lean(),
    canonicalArtist.legacyArtistId
      ? ContractTermsModel.findOne({ kunstlerId: canonicalArtist.legacyArtistId })
          .select({ printCommissionPct: 1, originalCommissionPct: 1 })
          .lean()
      : Promise.resolve(null),
  ]);

  const productByShopifyGid = new Map<string, ProductRecord>();
  for (const product of products) {
    const productGid = product.shopify?.productGid?.trim();
    if (!productGid) continue;
    productByShopifyGid.set(productGid, {
      productKey: product.productKey,
      title: product.title,
      offerings: product.offerings,
      allowPrints: product.allowPrints,
      originalAvailable: product.originalAvailable,
      shopifyProductGid: productGid,
    });
  }

  if (productByShopifyGid.size === 0) {
    return finalizeEarningsResponse(context, buildEmptyResponse());
  }

  const productGids = Array.from(productByShopifyGid.keys());
  const orders = await ShopifyOrderCacheModel.find({
    "lineItems.shopifyProductGid": { $in: productGids },
  })
    .sort({ createdAt: -1 })
    .lean();

  const orderGids = orders.map((order) => order.shopifyOrderGid).filter((value): value is string => Boolean(value));
  const [overrides, payouts] = await Promise.all([
    orderGids.length
      ? OrderLineOverrideModel.find({
          orderSource: "shopify",
          shopifyOrderGid: { $in: orderGids },
        })
          .select({ shopifyOrderGid: 1, lineKey: 1, overrideSaleType: 1, overrideGross: 1 })
          .lean()
      : Promise.resolve([]),
    PayoutTransactionModel.find(
      canonicalArtist.shopify?.metaobjectGid || canonicalArtist.shopifyMetaobjectId || canonicalArtist.legacyArtistId
        ? {
            $or: [
              ...(canonicalArtist.legacyArtistId ? [{ artistMongoId: canonicalArtist.legacyArtistId }] : []),
              ...(canonicalArtist.shopify?.metaobjectGid ? [{ artistMetaobjectGid: canonicalArtist.shopify.metaobjectGid }] : []),
              ...(canonicalArtist.shopifyMetaobjectId ? [{ artistMetaobjectGid: canonicalArtist.shopifyMetaobjectId }] : []),
            ],
          }
        : { _id: null },
    )
      .select({ amount: 1, currency: 1 })
      .lean(),
  ]);

  const overrideMap = new Map<string, { overrideSaleType?: string; overrideGross?: number }>();
  for (const override of overrides) {
    if (!override.shopifyOrderGid || !override.lineKey) continue;
    overrideMap.set(`${override.shopifyOrderGid}:${override.lineKey}`, {
      overrideSaleType: override.overrideSaleType || undefined,
      overrideGross: override.overrideGross ?? undefined,
    });
  }

  const currency = payouts.find((entry) => entry.currency)?.currency || orders.find((entry) => entry.currency)?.currency || "EUR";
  const contractTerms = terms
    ? {
        printCommissionPct: Number(terms.printCommissionPct || 0),
        originalCommissionPct: Number(terms.originalCommissionPct || 0),
      }
    : null;

  const saleRecords: SaleRecord[] = [];
  let paidOutAmount = 0;
  for (const payout of payouts) {
    paidOutAmount += Number(payout.amount || 0);
  }

  for (const order of orders) {
    const orderStatus = normalizeOrderStatus({
      financialStatus: order.financialStatus,
      cancelledAt: order.cancelledAt,
      refundedTotalGross: order.refundedTotalGross,
    });
    const orderDate = new Date(order.createdAt || order.updatedAt || new Date());
    const orderDateIso = orderDate.toISOString();

    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    for (let index = 0; index < lineItems.length; index += 1) {
      const line = lineItems[index];
      const productGid = line.shopifyProductGid?.trim();
      if (!productGid) continue;

      const product = productByShopifyGid.get(productGid);
      if (!product) continue;

      const lineKey = line.lineId || `${order.shopifyOrderGid}:line:${index}`;
      const override = overrideMap.get(`${order.shopifyOrderGid}:${lineKey}`);
      const salePrice = Number(override?.overrideGross ?? line.lineTotal ?? 0);
      const saleType = inferSaleType({
        rawSaleType: override?.overrideSaleType || line.inferredSaleType,
        variantTitle: line.variantTitle,
        product,
      });
      const artistShare = calculateArtistShare({
        salePrice,
        saleType,
        terms: contractTerms,
      });

      saleRecords.push({
        orderDate: orderDateIso,
        artworkTitle: product.title || line.title || "Untitled artwork",
        variantTitle: line.variantTitle || null,
        quantity: Number(line.quantity || 0),
        salePrice: toMoney(salePrice),
        artistShare: artistShare.amount,
        artistShareIsEstimated: artistShare.isEstimated,
        payoutStatus: orderStatus === "refunded" ? "refunded" : orderStatus === "cancelled" ? "cancelled" : "pending",
        orderStatus,
        productKey: product.productKey,
      });
    }
  }

  saleRecords.sort((left, right) => new Date(left.orderDate).getTime() - new Date(right.orderDate).getTime());

  let paidCoverage = toMoney(paidOutAmount);
  for (const record of saleRecords) {
    if (record.orderStatus === "refunded" || record.orderStatus === "cancelled") continue;
    if (paidCoverage > 0 && paidCoverage + 0.001 >= record.artistShare) {
      record.payoutStatus = "paid";
      paidCoverage = toMoney(paidCoverage - record.artistShare);
    }
  }

  let totalSalesAmount = 0;
  let soldItemsCount = 0;
  let estimatedArtistEarnings = 0;
  let refundedAmount = 0;

  const salesByMonthMap = new Map<string, { soldItemsCount: number; totalSalesAmount: number }>();
  const earningsByMonthMap = new Map<string, number>();
  const bestSellingMap = new Map<string, { artworkTitle: string; soldItemsCount: number; totalSalesAmount: number; estimatedArtistEarnings: number }>();

  for (const record of saleRecords) {
    const isRefunded = record.orderStatus === "refunded" || record.orderStatus === "cancelled";
    if (isRefunded) {
      refundedAmount += record.artistShare;
      continue;
    }

    totalSalesAmount += record.salePrice;
    soldItemsCount += record.quantity;
    estimatedArtistEarnings += record.artistShare;

    const monthKey = toMonthKey(new Date(record.orderDate));
    const monthSales = salesByMonthMap.get(monthKey) || { soldItemsCount: 0, totalSalesAmount: 0 };
    monthSales.soldItemsCount += record.quantity;
    monthSales.totalSalesAmount += record.salePrice;
    salesByMonthMap.set(monthKey, monthSales);

    earningsByMonthMap.set(monthKey, (earningsByMonthMap.get(monthKey) || 0) + record.artistShare);

    const bestSelling = bestSellingMap.get(record.productKey) || {
      artworkTitle: record.artworkTitle,
      soldItemsCount: 0,
      totalSalesAmount: 0,
      estimatedArtistEarnings: 0,
    };
    bestSelling.soldItemsCount += record.quantity;
    bestSelling.totalSalesAmount += record.salePrice;
    bestSelling.estimatedArtistEarnings += record.artistShare;
    bestSellingMap.set(record.productKey, bestSelling);
  }

  const response = artistEarningsResponse.parse({
    currency,
    totalSalesAmount: toMoney(totalSalesAmount),
    soldItemsCount,
    estimatedArtistEarnings: toMoney(estimatedArtistEarnings),
    pendingPayoutAmount: toMoney(Math.max(estimatedArtistEarnings - paidOutAmount, 0)),
    paidOutAmount: toMoney(paidOutAmount),
    refundedAmount: toMoney(refundedAmount),
    salesByMonth: Array.from(salesByMonthMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, value]) => ({
        month,
        label: toMonthLabel(month),
        soldItemsCount: value.soldItemsCount,
        totalSalesAmount: toMoney(value.totalSalesAmount),
      })),
    earningsByMonth: Array.from(earningsByMonthMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, amount]) => ({
        month,
        label: toMonthLabel(month),
        amount: toMoney(amount),
      })),
    bestSellingArtworks: Array.from(bestSellingMap.entries())
      .map(([productKey, value]) => ({
        productKey,
        artworkTitle: value.artworkTitle,
        soldItemsCount: value.soldItemsCount,
        totalSalesAmount: toMoney(value.totalSalesAmount),
        estimatedArtistEarnings: toMoney(value.estimatedArtistEarnings),
      }))
      .sort((left, right) => {
        if (right.soldItemsCount !== left.soldItemsCount) return right.soldItemsCount - left.soldItemsCount;
        return right.totalSalesAmount - left.totalSalesAmount;
      })
      .slice(0, 5),
    recentSales: saleRecords
      .slice()
      .sort((left, right) => new Date(right.orderDate).getTime() - new Date(left.orderDate).getTime())
      .slice(0, 20)
      .map((record) => ({
        orderDate: record.orderDate,
        artworkTitle: record.artworkTitle,
        variantTitle: record.variantTitle,
        quantity: record.quantity,
        salePrice: toMoney(record.salePrice),
        artistShare: toMoney(record.artistShare),
        artistShareIsEstimated: record.artistShareIsEstimated,
        payoutStatus: record.payoutStatus,
        orderStatus: record.orderStatus,
        productKey: record.productKey,
      })),
  });

  return finalizeEarningsResponse(context, response);
}
