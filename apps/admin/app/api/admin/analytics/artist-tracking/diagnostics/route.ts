import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { connectMongo } from "@/lib/mongodb";
import { AnalyticsDailyAggregateModel } from "@/models/AnalyticsDailyAggregate";
import { AnalyticsEventModel } from "@/models/AnalyticsEvent";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    await connectMongo();
    const today = startOfUtcDay(new Date());

    const [totalEventsToday, latestEvents, aggregateCounts, unmatchedTrackingEvents, topPaths, errors] = await Promise.all([
      AnalyticsEventModel.countDocuments({ createdAt: { $gte: today } }),
      AnalyticsEventModel.find({})
        .sort({ createdAt: -1 })
        .limit(20)
        .select({
          createdAt: 1,
          eventType: 1,
          path: 1,
          pageHandle: 1,
          pageUrl: 1,
          artistSlug: 1,
          artistMetaobjectId: 1,
          artistName: 1,
          productHandle: 1,
          productKey: 1,
          country: 1,
          resolutionStatus: 1,
          resolutionReason: 1,
        })
        .lean(),
      AnalyticsDailyAggregateModel.aggregate([
        { $match: { date: { $gte: today }, bucket: "overall" } },
        { $group: { _id: "$eventType", count: { $sum: "$count" }, uniqueVisitors: { $sum: "$uniqueVisitors" } } },
        { $sort: { count: -1 } },
      ]).exec(),
      AnalyticsEventModel.find({ resolutionStatus: { $ne: "matched" } })
        .sort({ createdAt: -1 })
        .limit(20)
        .select({
          createdAt: 1,
          eventType: 1,
          path: 1,
          pageHandle: 1,
          pageUrl: 1,
          artistSlug: 1,
          artistMetaobjectId: 1,
          artistName: 1,
          productHandle: 1,
          productKey: 1,
          resolutionStatus: 1,
          resolutionReason: 1,
        })
        .lean(),
      AnalyticsEventModel.aggregate([
        { $match: { createdAt: { $gte: today }, path: { $exists: true, $ne: "" } } },
        { $group: { _id: "$path", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]).exec(),
      AnalyticsEventModel.aggregate([
        { $match: { resolutionStatus: { $ne: "matched" } } },
        { $group: { _id: { resolutionStatus: "$resolutionStatus", resolutionReason: "$resolutionReason" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]).exec(),
    ]);

    return NextResponse.json(
      {
        totalEventsToday,
        latestEvents,
        aggregateCounts: aggregateCounts.map((item) => ({
          eventType: item._id,
          count: item.count,
          uniqueVisitors: item.uniqueVisitors,
        })),
        unmatchedTrackingEvents,
        topPaths: topPaths.map((item) => ({ path: item._id, count: item.count })),
        errors: errors.map((item) => ({
          resolutionStatus: item._id.resolutionStatus,
          resolutionReason: item._id.resolutionReason,
          count: item.count,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to load artist tracking diagnostics", error);
    return NextResponse.json({ ok: false, error: "artist_tracking_diagnostics_failed" }, { status: 500 });
  }
}
