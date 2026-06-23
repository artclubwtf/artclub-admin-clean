import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { canonicalStatusValues } from "./canonicalStates";

export const canonicalProductTypes = ["artwork", "merch", "service"] as const;
export const canonicalProductOfferings = ["original_only", "prints_only", "original_plus_prints"] as const;
export const canonicalProductStatuses = [
  "draft",
  "pending_review",
  "approved",
  "shopify_pending",
  "shopify_synced",
  "active",
  "archived",
  "db_only",
] as const;
export const canonicalProductAssignmentStatuses = ["unassigned", "assigned", "confirmed", "needs_review"] as const;

const canonicalProductImagesSchema = new Schema(
  {
    thumbUrl: { type: String },
    mediumUrl: { type: String },
    originalUrl: { type: String },
    galleryUrls: { type: [String], default: [] },
    altText: { type: String, trim: true },
    source: { type: String, trim: true },
    artistMediaIds: { type: [String], default: [] },
  },
  { _id: false },
);

const canonicalProductDimensionsSchema = new Schema(
  {
    widthCm: { type: Number },
    heightCm: { type: Number },
  },
  { _id: false },
);

const canonicalProductShopifySchema = new Schema(
  {
    productGid: { type: String },
    lastPulledAt: { type: Date },
    lastPushedAt: { type: Date },
  },
  { _id: false },
);

const canonicalProductSyncSchema = new Schema(
  {
    status: { type: String, trim: true },
    dirtyFields: { type: [String], default: [] },
    dirtyAt: { type: Date },
    needsPush: { type: Boolean, default: false },
    lastPushAt: { type: Date },
    lastPullAt: { type: Date },
    lastError: { type: String },
  },
  { _id: false },
);

const canonicalProductSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    productKey: { type: String, required: true, trim: true },
    type: { type: String, enum: canonicalProductTypes, required: true },
    title: { type: String, required: true, trim: true },
    handle: { type: String, trim: true },
    vendor: { type: String, trim: true },
    description: { type: String },
    bodyHtml: { type: String },
    descriptionHtml: { type: String },
    tags: { type: [String], default: [] },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    artistKey: { type: String, trim: true },
    artistRef: { type: String, trim: true },
    artistSlug: { type: String, trim: true },
    shopifyProductId: { type: String, trim: true },
    legacyProductId: { type: String, trim: true },
    assignmentStatus: { type: String, enum: canonicalProductAssignmentStatuses },
    migrationStatus: { type: String, enum: canonicalStatusValues },
    approvalStatus: { type: String, enum: canonicalStatusValues },
    seriesId: { type: String, trim: true },
    seriesName: { type: String, trim: true },
    images: { type: canonicalProductImagesSchema, default: () => ({ galleryUrls: [] }) },
    offerings: { type: String, enum: canonicalProductOfferings, required: true },
    forSale: { type: Boolean, default: true },
    allowPrints: { type: Boolean, default: false },
    originalAvailable: { type: Boolean, default: false },
    status: { type: String, enum: canonicalProductStatuses, default: "draft" },
    year: { type: Number },
    dimensions: { type: canonicalProductDimensionsSchema, default: () => ({}) },
    shortText: { type: String },
    shortDescription: { type: String },
    shopify: { type: canonicalProductShopifySchema, default: () => ({}) },
    sync: { type: canonicalProductSyncSchema, default: () => ({ dirtyFields: [] }) },
  },
  { timestamps: true },
);

canonicalProductSchema.index({ shopDomain: 1, productKey: 1 }, { unique: true });
canonicalProductSchema.index({ shopDomain: 1, canonicalArtistId: 1, createdAt: -1 });
canonicalProductSchema.index({ shopDomain: 1, artistKey: 1, createdAt: -1 });
canonicalProductSchema.index(
  { shopDomain: 1, shopifyProductId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      shopifyProductId: { $type: "string" },
    },
  },
);
canonicalProductSchema.index(
  { shopDomain: 1, "shopify.productGid": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "shopify.productGid": { $type: "string" },
    },
  },
);
canonicalProductSchema.index({ shopDomain: 1, "sync.needsPush": 1, "sync.dirtyAt": 1 });
canonicalProductSchema.index({ shopDomain: 1, legacyProductId: 1 });

type CanonicalProduct = InferSchemaType<typeof canonicalProductSchema>;
export type CanonicalProductType = (typeof canonicalProductTypes)[number];
export type CanonicalProductOffering = (typeof canonicalProductOfferings)[number];
export type CanonicalProductStatus = (typeof canonicalProductStatuses)[number];

export const CanonicalProductModel =
  (models.CanonicalProduct as Model<CanonicalProduct>) ||
  model<CanonicalProduct>("CanonicalProduct", canonicalProductSchema);

export type { CanonicalProduct };
