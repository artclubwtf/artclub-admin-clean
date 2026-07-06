import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const analyticsResolutionStatuses = ["matched", "partial", "unmatched"] as const;

const analyticsEventSchema = new Schema(
  {
    eventType: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    path: { type: String, trim: true },
    referrer: { type: String, trim: true },
    pageHandle: { type: String, trim: true },
    pageUrl: { type: String, trim: true },
    visitorIdHash: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    profileId: { type: Schema.Types.ObjectId, ref: "NetworkProfile" },
    targetProfileId: { type: Schema.Types.ObjectId, ref: "NetworkProfile" },
    sessionId: { type: String, trim: true },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    artistSlug: { type: String, trim: true },
    artistMetaobjectId: { type: String, trim: true },
    artistName: { type: String, trim: true },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    postId: { type: Schema.Types.ObjectId, ref: "NetworkPost" },
    eventId: { type: Schema.Types.ObjectId, ref: "NetworkEvent" },
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
analyticsEventSchema.index({ eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ profileId: 1, createdAt: -1 });

type AnalyticsEvent = InferSchemaType<typeof analyticsEventSchema>;

export const AnalyticsEventModel =
  (models.AnalyticsEvent as Model<AnalyticsEvent>) ||
  model<AnalyticsEvent>("AnalyticsEvent", analyticsEventSchema);

export type { AnalyticsEvent };
