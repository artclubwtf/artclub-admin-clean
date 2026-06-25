import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const analyticsResolutionStatuses = ["matched", "partial", "unmatched"] as const;

const analyticsEventSchema = new Schema(
  {
    eventType: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    path: { type: String, trim: true },
    referrer: { type: String, trim: true },
    visitorIdHash: { type: String, required: true, trim: true },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    artistSlug: { type: String, trim: true },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    productKey: { type: String, trim: true },
    shopifyProductId: { type: String, trim: true },
    productHandle: { type: String, trim: true },
    city: { type: String, trim: true },
    region: { type: String, trim: true },
    country: { type: String, trim: true },
    deviceCategory: { type: String, trim: true },
    browserFamily: { type: String, trim: true },
    resolutionStatus: { type: String, enum: analyticsResolutionStatuses, required: true },
    resolutionReason: { type: String, trim: true },
    createdAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: "analytics_events" },
);

analyticsEventSchema.index({ createdAt: -1 });
analyticsEventSchema.index({ canonicalArtistId: 1, createdAt: -1, eventType: 1 });
analyticsEventSchema.index({ canonicalProductId: 1, createdAt: -1, eventType: 1 });
analyticsEventSchema.index({ resolutionStatus: 1, createdAt: -1 });
analyticsEventSchema.index({ path: 1, createdAt: -1 });

type AnalyticsEvent = InferSchemaType<typeof analyticsEventSchema>;

export const AnalyticsEventModel =
  (models.AnalyticsEvent as Model<AnalyticsEvent>) ||
  model<AnalyticsEvent>("AnalyticsEvent", analyticsEventSchema);

export type { AnalyticsEvent };
