import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const analyticsUniqueVisitorSchema = new Schema(
  {
    uniqueKey: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true },
    dateKey: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    visitorIdHash: { type: String, required: true, trim: true },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    productKey: { type: String, trim: true },
    productHandle: { type: String, trim: true },
    artistSlug: { type: String, trim: true },
    city: { type: String, trim: true },
    region: { type: String, trim: true },
    country: { type: String, trim: true },
  },
  { timestamps: true, collection: "analytics_unique_visitors" },
);

analyticsUniqueVisitorSchema.index({ canonicalArtistId: 1, date: -1, visitorIdHash: 1 });
analyticsUniqueVisitorSchema.index({ canonicalProductId: 1, date: -1, visitorIdHash: 1 });
analyticsUniqueVisitorSchema.index({ country: 1, city: 1, date: -1 });

type AnalyticsUniqueVisitor = InferSchemaType<typeof analyticsUniqueVisitorSchema>;

export const AnalyticsUniqueVisitorModel =
  (models.AnalyticsUniqueVisitor as Model<AnalyticsUniqueVisitor>) ||
  model<AnalyticsUniqueVisitor>("AnalyticsUniqueVisitor", analyticsUniqueVisitorSchema);

export type { AnalyticsUniqueVisitor };
