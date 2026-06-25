import {
  analyticsClickEventTypes,
  analyticsEventTypes,
  analyticsImpressionEventTypes,
  analyticsViewEventTypes,
  artistAnalyticsResponse,
  resolveArtistAnalyticsDateRange,
  type ArtistAnalyticsRange,
  type ArtistAnalyticsResponse,
} from "@artclub/models";

import { loadArtistOrderSales } from "../../../admin/lib/artistOrderSales";
import { ensureFreshShopifyOrderCache } from "../../../admin/lib/shopifyOrderAutoSync";
import type { ArtistContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import { AnalyticsDailyAggregateModel, AnalyticsUniqueVisitorModel, CanonicalProductModel } from "@/lib/server/models";

type EventCountRow = { _id: string; count: number };
type DailyCountRow = { _id: { dateKey: string; eventType: string }; count: number };
type ArtworkCountRow = { _id: { canonicalProductId: string; productKey?: string; eventType: string }; count: number };
type ArtworkUniqueRow = { _id: { canonicalProductId: string; productKey?: string }; uniqueVisitors: number };
type GeoCountRow = { _id: { country?: string; region?: string; city?: string }; count: number };
type GeoUniqueRow = { _id: { country?: string; region?: string; city?: string }; uniqueVisitors: number };
type VisitorCountRow = { _id: string };

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function formatDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

function buildDateKeys(range: ArtistAnalyticsRange) {
  const { since, days } = resolveArtistAnalyticsDateRange(range);
  const keys: string[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(since.getTime() + index * 24 * 60 * 60 * 1000);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function buildSeries(dateKeys: string[], countsByDate: Map<string, number>) {
  return dateKeys.map((dateKey) => ({
    date: dateKey,
    label: formatDayLabel(dateKey),
    count: countsByDate.get(dateKey) || 0,
  }));
}

function buildEmptyAnalytics(range: ArtistAnalyticsRange): ArtistAnalyticsResponse {
  const dateKeys = buildDateKeys(range);
  return artistAnalyticsResponse.parse({
    range,
    profileViews: 0,
    profileImpressions: 0,
    artworkViews: 0,
    artworkImpressions: 0,
    artworkClicks: 0,
    shopifyProductClicks: 0,
    uniqueVisitors: 0,
    engagementRate: 0,
    impressionEngagementRate: 0,
    conversionRate: 0,
    soldItemsCount: 0,
    topArtworks: [],
    topCities: [],
    topCountries: [],
    viewsByDay: buildSeries(dateKeys, new Map()),
    impressionsByDay: buildSeries(dateKeys, new Map()),
    clicksByDay: buildSeries(dateKeys, new Map()),
    salesByDay: dateKeys.map((date) => ({ date, label: formatDayLabel(date), soldItemsCount: 0 })),
  });
}

export async function loadArtistAnalytics(context: ArtistContext, range: ArtistAnalyticsRange): Promise<ArtistAnalyticsResponse> {
  await connectMongo();

  try {
    await ensureFreshShopifyOrderCache({ reason: "artist_analytics" });
  } catch (error) {
    console.error("Failed to auto-sync Shopify orders for artist analytics", error);
  }

  const resolvedRange = resolveArtistAnalyticsDateRange(range);
  const since = resolvedRange.since;
  const until = resolvedRange.until;
  const dateKeys = buildDateKeys(range);
  const match = {
    canonicalArtistId: context.canonicalArtist._id,
    date: { $gte: since, $lte: until },
  };

  const uniqueMatch = {
    canonicalArtistId: context.canonicalArtist._id,
    date: { $gte: since, $lte: until },
  };

  const [
    summaryRows,
    dailyRows,
    artworkRows,
    artworkUniqueRows,
    countryRows,
    countryUniqueRows,
    cityRows,
    cityUniqueRows,
    visitorRows,
    sales,
  ] = await Promise.all([
    AnalyticsDailyAggregateModel.aggregate<EventCountRow>([
      { $match: { ...match, bucket: "overall", eventType: { $in: analyticsEventTypes } } },
      { $group: { _id: "$eventType", count: { $sum: "$count" } } },
    ]).exec(),
    AnalyticsDailyAggregateModel.aggregate<DailyCountRow>([
      { $match: { ...match, bucket: "overall", eventType: { $in: analyticsEventTypes } } },
      { $group: { _id: { dateKey: "$dateKey", eventType: "$eventType" }, count: { $sum: "$count" } } },
    ]).exec(),
    AnalyticsDailyAggregateModel.aggregate<ArtworkCountRow>([
      { $match: { ...match, bucket: "overall", canonicalProductId: { $exists: true, $ne: null }, eventType: { $in: analyticsEventTypes } } },
      { $group: { _id: { canonicalProductId: "$canonicalProductId", productKey: "$productKey", eventType: "$eventType" }, count: { $sum: "$count" } } },
    ]).exec(),
    AnalyticsUniqueVisitorModel.aggregate<ArtworkUniqueRow>([
      { $match: { ...uniqueMatch, canonicalProductId: { $exists: true, $ne: null } } },
      { $group: { _id: { canonicalProductId: "$canonicalProductId", productKey: "$productKey", visitorIdHash: "$visitorIdHash" } } },
      { $group: { _id: { canonicalProductId: "$_id.canonicalProductId", productKey: "$_id.productKey" }, uniqueVisitors: { $sum: 1 } } },
    ]).exec(),
    AnalyticsDailyAggregateModel.aggregate<GeoCountRow>([
      { $match: { ...match, bucket: "country", country: { $exists: true, $ne: null } } },
      { $group: { _id: { country: "$country" }, count: { $sum: "$count" } } },
    ]).exec(),
    AnalyticsUniqueVisitorModel.aggregate<GeoUniqueRow>([
      { $match: { ...uniqueMatch, country: { $exists: true, $ne: null } } },
      { $group: { _id: { country: "$country", visitorIdHash: "$visitorIdHash" } } },
      { $group: { _id: { country: "$_id.country" }, uniqueVisitors: { $sum: 1 } } },
    ]).exec(),
    AnalyticsDailyAggregateModel.aggregate<GeoCountRow>([
      { $match: { ...match, bucket: "city", city: { $exists: true, $ne: null } } },
      { $group: { _id: { country: "$country", region: "$region", city: "$city" }, count: { $sum: "$count" } } },
    ]).exec(),
    AnalyticsUniqueVisitorModel.aggregate<GeoUniqueRow>([
      { $match: { ...uniqueMatch, city: { $exists: true, $ne: null } } },
      { $group: { _id: { country: "$country", region: "$region", city: "$city", visitorIdHash: "$visitorIdHash" } } },
      { $group: { _id: { country: "$_id.country", region: "$_id.region", city: "$_id.city" }, uniqueVisitors: { $sum: 1 } } },
    ]).exec(),
    AnalyticsUniqueVisitorModel.aggregate<VisitorCountRow>([
      { $match: uniqueMatch },
      { $group: { _id: "$visitorIdHash" } },
    ]).exec(),
    loadArtistOrderSales({
      linkedUserId: context.user._id,
      shopDomain: context.user.shopDomain,
      includeCancelled: true,
      includeUnpaid: true,
    }),
  ]);

  if (
    summaryRows.length === 0 &&
    dailyRows.length === 0 &&
    artworkRows.length === 0 &&
    countryRows.length === 0 &&
    cityRows.length === 0 &&
    visitorRows.length === 0
  ) {
    const empty = buildEmptyAnalytics(range);
    const filteredSales = sales.saleLines.filter((line) => {
      const createdAt = new Date(line.createdAt);
      return createdAt >= since && createdAt <= until;
    });
    if (!filteredSales.length) return empty;
  }

  const summary = new Map(summaryRows.map((row) => [row._id, row.count]));
  const dailyViewMap = new Map<string, number>();
  const dailyImpressionMap = new Map<string, number>();
  const dailyClickMap = new Map<string, number>();

  for (const row of dailyRows) {
    const dateKey = row._id.dateKey;
    const eventType = row._id.eventType;
    if (analyticsViewEventTypes.includes(eventType as (typeof analyticsViewEventTypes)[number])) {
      dailyViewMap.set(dateKey, (dailyViewMap.get(dateKey) || 0) + row.count);
    }
    if (analyticsImpressionEventTypes.includes(eventType as (typeof analyticsImpressionEventTypes)[number])) {
      dailyImpressionMap.set(dateKey, (dailyImpressionMap.get(dateKey) || 0) + row.count);
    }
    if (analyticsClickEventTypes.includes(eventType as (typeof analyticsClickEventTypes)[number])) {
      dailyClickMap.set(dateKey, (dailyClickMap.get(dateKey) || 0) + row.count);
    }
  }

  const productIds = Array.from(
    new Set(
      artworkRows
        .map((row) => row._id.canonicalProductId)
        .filter((value): value is string => Boolean(value))
        .map((value) => String(value)),
    ),
  );
  const products = productIds.length
    ? await CanonicalProductModel.find({ _id: { $in: productIds } }).select({ _id: 1, title: 1, productKey: 1 }).lean()
    : [];
  const productById = new Map(products.map((product) => [String(product._id), product]));

  const artworkCounts = new Map<
    string,
    {
      canonicalProductId: string;
      productKey: string;
      views: number;
      impressions: number;
      clicks: number;
    }
  >();

  for (const row of artworkRows) {
    const productId = String(row._id.canonicalProductId);
    const current = artworkCounts.get(productId) || {
      canonicalProductId: productId,
      productKey: row._id.productKey || productById.get(productId)?.productKey || productId,
      views: 0,
      impressions: 0,
      clicks: 0,
    };
    if (row._id.eventType === "artwork_view") current.views += row.count;
    if (row._id.eventType === "artwork_impression") current.impressions += row.count;
    if (row._id.eventType === "artwork_click" || row._id.eventType === "shopify_product_click") current.clicks += row.count;
    artworkCounts.set(productId, current);
  }

  const artworkUniqueMap = new Map(artworkUniqueRows.map((row) => [String(row._id.canonicalProductId), row.uniqueVisitors]));
  const topArtworks = Array.from(artworkCounts.values())
    .map((entry) => {
      const product = productById.get(entry.canonicalProductId);
      return {
        canonicalProductId: entry.canonicalProductId,
        productKey: entry.productKey,
        title: product?.title || entry.productKey || "Untitled artwork",
        views: entry.views,
        impressions: entry.impressions,
        clicks: entry.clicks,
        uniqueVisitors: artworkUniqueMap.get(entry.canonicalProductId) || 0,
        clickThroughRate: toPercent(entry.clicks, Math.max(entry.views, 1)),
      };
    })
    .sort((left, right) => {
      if (right.views !== left.views) return right.views - left.views;
      if (right.clicks !== left.clicks) return right.clicks - left.clicks;
      return right.impressions - left.impressions;
    })
    .slice(0, 5);

  const countryUniqueMap = new Map(countryUniqueRows.map((row) => [row._id.country || "", row.uniqueVisitors]));
  const cityUniqueMap = new Map(cityUniqueRows.map((row) => [`${row._id.country || ""}|${row._id.region || ""}|${row._id.city || ""}`, row.uniqueVisitors]));

  const topCountries = countryRows
    .map((row) => ({
      label: row._id.country || "Unknown",
      country: row._id.country || undefined,
      count: row.count,
      uniqueVisitors: countryUniqueMap.get(row._id.country || "") || 0,
    }))
    .sort((left, right) => right.count - left.count || right.uniqueVisitors - left.uniqueVisitors)
    .slice(0, 5);

  const topCities = cityRows
    .map((row) => ({
      label: [row._id.city, row._id.country].filter(Boolean).join(", ") || "Unknown",
      country: row._id.country || undefined,
      region: row._id.region || undefined,
      city: row._id.city || undefined,
      count: row.count,
      uniqueVisitors: cityUniqueMap.get(`${row._id.country || ""}|${row._id.region || ""}|${row._id.city || ""}`) || 0,
    }))
    .sort((left, right) => right.count - left.count || right.uniqueVisitors - left.uniqueVisitors)
    .slice(0, 5);

  const salesByDayMap = new Map<string, number>();
  let soldItemsCount = 0;
  for (const saleLine of sales.saleLines) {
    const createdAt = new Date(saleLine.createdAt);
    if (createdAt < since || createdAt > until) continue;
    if (saleLine.orderStatus === "refunded" || saleLine.orderStatus === "cancelled") continue;
    const dateKey = createdAt.toISOString().slice(0, 10);
    soldItemsCount += Number(saleLine.quantity || 0);
    salesByDayMap.set(dateKey, (salesByDayMap.get(dateKey) || 0) + Number(saleLine.quantity || 0));
  }

  const profileViews = summary.get("artist_profile_view") || 0;
  const profileImpressions = summary.get("artist_profile_impression") || 0;
  const artworkViews = summary.get("artwork_view") || 0;
  const artworkImpressions = summary.get("artwork_impression") || 0;
  const artworkClicks = summary.get("artwork_click") || 0;
  const shopifyProductClicks = summary.get("shopify_product_click") || 0;
  const clickTotal = artworkClicks + shopifyProductClicks;

  return artistAnalyticsResponse.parse({
    range,
    profileViews,
    profileImpressions,
    artworkViews,
    artworkImpressions,
    artworkClicks,
    shopifyProductClicks,
    uniqueVisitors: visitorRows.length,
    engagementRate: toPercent(clickTotal, profileViews + artworkViews),
    impressionEngagementRate: toPercent(clickTotal, profileImpressions + artworkImpressions),
    conversionRate: toPercent(soldItemsCount, artworkViews),
    soldItemsCount,
    topArtworks,
    topCities,
    topCountries,
    viewsByDay: buildSeries(dateKeys, dailyViewMap),
    impressionsByDay: buildSeries(dateKeys, dailyImpressionMap),
    clicksByDay: buildSeries(dateKeys, dailyClickMap),
    salesByDay: dateKeys.map((date) => ({
      date,
      label: formatDayLabel(date),
      soldItemsCount: salesByDayMap.get(date) || 0,
    })),
  });
}
