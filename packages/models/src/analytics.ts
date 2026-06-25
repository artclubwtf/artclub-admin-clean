import { z } from "zod";

export const artistAnalyticsRange = z.enum(["7d", "30d", "90d"]);
export type ArtistAnalyticsRange = z.infer<typeof artistAnalyticsRange>;

export const analyticsEventTypes = [
  "artist_profile_impression",
  "artist_profile_view",
  "artwork_impression",
  "artwork_view",
  "artwork_click",
  "shopify_product_click",
] as const;
export type AnalyticsEventType = (typeof analyticsEventTypes)[number];

export const analyticsViewEventTypes = ["artist_profile_view", "artwork_view"] as const;
export const analyticsImpressionEventTypes = ["artist_profile_impression", "artwork_impression"] as const;
export const analyticsClickEventTypes = ["artwork_click", "shopify_product_click"] as const;
export const analyticsProductEventTypes = ["artwork_impression", "artwork_view", "artwork_click", "shopify_product_click"] as const;

export const artistAnalyticsSeriesPoint = z.object({
  date: z.string(),
  label: z.string(),
  count: z.number(),
});
export type ArtistAnalyticsSeriesPoint = z.infer<typeof artistAnalyticsSeriesPoint>;

export const artistAnalyticsSalesPoint = z.object({
  date: z.string(),
  label: z.string(),
  soldItemsCount: z.number(),
});
export type ArtistAnalyticsSalesPoint = z.infer<typeof artistAnalyticsSalesPoint>;

export const artistAnalyticsTopArtwork = z.object({
  canonicalProductId: z.string().optional(),
  productKey: z.string(),
  title: z.string(),
  views: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  uniqueVisitors: z.number(),
  clickThroughRate: z.number(),
});
export type ArtistAnalyticsTopArtwork = z.infer<typeof artistAnalyticsTopArtwork>;

export const artistAnalyticsLocationBucket = z.object({
  label: z.string(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  count: z.number(),
  uniqueVisitors: z.number(),
});
export type ArtistAnalyticsLocationBucket = z.infer<typeof artistAnalyticsLocationBucket>;

export const artistAnalyticsResponse = z.object({
  range: artistAnalyticsRange,
  profileViews: z.number(),
  profileImpressions: z.number(),
  artworkViews: z.number(),
  artworkImpressions: z.number(),
  artworkClicks: z.number(),
  shopifyProductClicks: z.number(),
  uniqueVisitors: z.number(),
  engagementRate: z.number(),
  impressionEngagementRate: z.number(),
  conversionRate: z.number(),
  soldItemsCount: z.number(),
  topArtworks: z.array(artistAnalyticsTopArtwork),
  topCities: z.array(artistAnalyticsLocationBucket),
  topCountries: z.array(artistAnalyticsLocationBucket),
  viewsByDay: z.array(artistAnalyticsSeriesPoint),
  impressionsByDay: z.array(artistAnalyticsSeriesPoint),
  clicksByDay: z.array(artistAnalyticsSeriesPoint),
  salesByDay: z.array(artistAnalyticsSalesPoint),
});
export type ArtistAnalyticsResponse = z.infer<typeof artistAnalyticsResponse>;

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function resolveArtistAnalyticsDateRange(range: ArtistAnalyticsRange) {
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const until = endOfUtcDay(new Date());
  const since = startOfUtcDay(new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { days, since, until };
}
