import type { ArtistEarningsOrderStatus, ArtistEarningsPayoutStatus, ArtistEarningsResponse } from "@artclub/models";

import { artistEarningsResponse } from "@artclub/models";

import type { ArtistContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import {
  CanonicalArtistModel,
  PayoutTransactionModel,
  ShopifyOrderCacheModel,
} from "@/lib/server/models";
import { logArtistEarnings } from "../../../admin/lib/sync/syncLogger";

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

function normalizeFinancialStatus(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function isPaidFinancialStatus(status: string) {
  return status.includes("paid");
}

function normalizeOrderStatus(input: { financialStatus?: string | null; cancelledAt?: Date | null; refundedTotalGross?: number | null; totalGross?: number | null }) {
  if (input.cancelledAt) return "cancelled" as const;

  const financialStatus = normalizeFinancialStatus(input.financialStatus);
  const refundedTotalGross = Number(input.refundedTotalGross || 0);
  const totalGross = Number(input.totalGross || 0);

  if (refundedTotalGross > 0 && totalGross > 0 && refundedTotalGross + 0.01 >= totalGross) return "refunded" as const;
  if (financialStatus.includes("refund") && refundedTotalGross > 0 && (totalGross === 0 || refundedTotalGross + 0.01 >= totalGross)) {
    return "refunded" as const;
  }
  if (isPaidFinancialStatus(financialStatus)) return "paid" as const;
  return "pending" as const;
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

  const [orders, payouts] = await Promise.all([
    ShopifyOrderCacheModel.find({
      "lineItems.canonicalArtistId": context.canonicalArtist._id,
    })
      .sort({ createdAt: -1 })
      .lean(),
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

  const currency = payouts.find((entry) => entry.currency)?.currency || orders.find((entry) => entry.currency)?.currency || "EUR";

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
      totalGross: order.totalGross,
    });
    const financialStatus = normalizeFinancialStatus(order.financialStatus);
    const countableSale = isPaidFinancialStatus(financialStatus);
    const orderDate = new Date(order.createdAt || order.updatedAt || new Date());
    const orderDateIso = orderDate.toISOString();

    const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
    for (const line of lineItems) {
      if (!line.canonicalArtistId || String(line.canonicalArtistId) !== String(context.canonicalArtist._id)) continue;

      if (!countableSale && orderStatus !== "refunded" && orderStatus !== "cancelled") continue;

      const salePrice = Number(line.lineTotal ?? 0);
      const artistShare = line.artistShare ?? line.estimatedArtistShare ?? salePrice;
      const artistShareIsEstimated = typeof line.artistShare !== "number";

      saleRecords.push({
        orderDate: orderDateIso,
        artworkTitle: line.title || "Untitled artwork",
        variantTitle: line.variantTitle || null,
        quantity: Number(line.quantity || 0),
        salePrice: toMoney(salePrice),
        artistShare: toMoney(Number(artistShare || 0)),
        artistShareIsEstimated,
        payoutStatus:
          orderStatus === "refunded"
            ? "refunded"
            : orderStatus === "cancelled"
              ? "cancelled"
              : ((line.payoutStatus as ArtistEarningsPayoutStatus | undefined) || "pending"),
        orderStatus,
        productKey: line.productKey || "",
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
