import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const canonicalProductTypes = ["artwork", "merch", "service"] as const;
export const canonicalProductOfferings = ["original_only", "prints_only", "original_plus_prints"] as const;
export const canonicalProductStatuses = ["draft", "active", "archived", "db_only"] as const;

const canonicalProductImagesSchema = new Schema(
  {
    thumbUrl: { type: String },
    mediumUrl: { type: String },
    originalUrl: { type: String },
    galleryUrls: { type: [String], default: [] },
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
    dirtyFields: { type: [String], default: [] },
    dirtyAt: { type: Date },
    needsPush: { type: Boolean, default: false },
  },
  { _id: false },
);

const canonicalProductSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    productKey: { type: String, required: true, trim: true },
    type: { type: String, enum: canonicalProductTypes, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    tags: { type: [String], default: [] },
    artistKey: { type: String, trim: true },
    artistRef: { type: String, trim: true },
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
    shopify: { type: canonicalProductShopifySchema, default: () => ({}) },
    sync: { type: canonicalProductSyncSchema, default: () => ({ dirtyFields: [] }) },
  },
  { timestamps: true },
);

canonicalProductSchema.index({ shopDomain: 1, productKey: 1 }, { unique: true });
canonicalProductSchema.index({ shopDomain: 1, artistKey: 1, createdAt: -1 });
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

type CanonicalProduct = InferSchemaType<typeof canonicalProductSchema>;
export type CanonicalProductType = (typeof canonicalProductTypes)[number];
export type CanonicalProductOffering = (typeof canonicalProductOfferings)[number];
export type CanonicalProductStatus = (typeof canonicalProductStatuses)[number];

export const CanonicalProductModel =
  (models.CanonicalProduct as Model<CanonicalProduct>) ||
  model<CanonicalProduct>("CanonicalProduct", canonicalProductSchema);

export type { CanonicalProduct };
