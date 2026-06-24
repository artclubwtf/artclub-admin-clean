import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const shopifySyncJobTypes = [
  "product_push",
  "artist_push",
  "inventory_sync",
  "product_reimport",
  "artist_reimport",
] as const;

export const shopifySyncJobStatuses = [
  "queued",
  "processing",
  "succeeded",
  "failed",
  "retry_scheduled",
] as const;

const shopifySyncJobSchema = new Schema(
  {
    type: { type: String, enum: shopifySyncJobTypes, required: true },
    status: { type: String, enum: shopifySyncJobStatuses, default: "queued", required: true },
    priority: { type: Number, default: 100 },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    productKey: { type: String, trim: true },
    artistKey: { type: String, trim: true },
    reason: { type: String, trim: true },
    payload: { type: Schema.Types.Mixed },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    nextRunAt: { type: Date, default: () => new Date() },
    lockedAt: { type: Date },
    lockedBy: { type: String, trim: true },
    lastError: { type: String },
    lastUserErrors: { type: Schema.Types.Mixed },
    lastGraphqlErrors: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed },
    finishedAt: { type: Date },
  },
  { timestamps: true, collection: "shopify_sync_jobs" },
);

shopifySyncJobSchema.index({ status: 1, nextRunAt: 1 });
shopifySyncJobSchema.index({ lockedAt: 1 });
shopifySyncJobSchema.index({ canonicalProductId: 1 });
shopifySyncJobSchema.index({ canonicalArtistId: 1 });
shopifySyncJobSchema.index({ productKey: 1 });
shopifySyncJobSchema.index({ type: 1 });

type ShopifySyncJob = InferSchemaType<typeof shopifySyncJobSchema>;
export type ShopifySyncJobType = (typeof shopifySyncJobTypes)[number];
export type ShopifySyncJobStatus = (typeof shopifySyncJobStatuses)[number];

export const ShopifySyncJobModel =
  (models.ShopifySyncJob as Model<ShopifySyncJob>) ||
  model<ShopifySyncJob>("ShopifySyncJob", shopifySyncJobSchema, "shopify_sync_jobs");

export type { ShopifySyncJob };
