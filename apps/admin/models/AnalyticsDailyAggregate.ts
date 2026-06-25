import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const analyticsAggregateBuckets = ["overall", "country", "city"] as const;

const analyticsDailyAggregateSchema = new Schema(
  {
    scopeKey: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true },
    dateKey: { type: String, required: true, trim: true },
    bucket: { type: String, enum: analyticsAggregateBuckets, required: true },
    eventType: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    productKey: { type: String, trim: true },
    productHandle: { type: String, trim: true },
    artistSlug: { type: String, trim: true },
    city: { type: String, trim: true },
    region: { type: String, trim: true },
    country: { type: String, trim: true },
    count: { type: Number, default: 0, min: 0 },
    uniqueVisitors: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "analytics_daily_aggregates" },
);

analyticsDailyAggregateSchema.index({ canonicalArtistId: 1, date: -1, bucket: 1, eventType: 1 });
analyticsDailyAggregateSchema.index({ canonicalProductId: 1, date: -1, eventType: 1 });
analyticsDailyAggregateSchema.index({ country: 1, city: 1, date: -1 });

type AnalyticsDailyAggregate = InferSchemaType<typeof analyticsDailyAggregateSchema>;

export const AnalyticsDailyAggregateModel =
  (models.AnalyticsDailyAggregate as Model<AnalyticsDailyAggregate>) ||
  model<AnalyticsDailyAggregate>("AnalyticsDailyAggregate", analyticsDailyAggregateSchema);

export type { AnalyticsDailyAggregate };
