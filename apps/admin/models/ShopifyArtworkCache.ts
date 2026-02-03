import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const shopifyArtworkImagesSchema = new Schema(
  {
    thumbUrl: { type: String },
    mediumUrl: { type: String },
    originalUrl: { type: String },
  },
  { _id: false },
);

const shopifyArtworkCacheSchema = new Schema(
  {
    productGid: { type: String, required: true, unique: true },
    productNumericId: { type: String },
    title: { type: String, required: true },
    handle: { type: String, required: true },
    artistMetaobjectGid: { type: String },
    artistName: { type: String },
    tags: { type: [String], default: [] },
    status: { type: String, required: true },
    images: { type: shopifyArtworkImagesSchema, required: true },
    widthCm: { type: Number },
    heightCm: { type: Number },
    shortDescription: { type: String },
    isOriginalTagged: { type: Boolean },
    priceEur: { type: Number, default: null },
    updatedAtShopify: { type: Date },
    lastImportedAt: { type: Date },
  },
  { timestamps: true, collection: "shopify_artworks_cache" },
);

shopifyArtworkCacheSchema.path("images").validate(
  function validateImages(value: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string }) {
    if (!value) return false;
    return Boolean(value.thumbUrl || value.mediumUrl || value.originalUrl);
  },
  "At least one image URL is required.",
);

shopifyArtworkCacheSchema.index({ lastImportedAt: -1 });

type ShopifyArtworkCache = InferSchemaType<typeof shopifyArtworkCacheSchema>;

export const ShopifyArtworkCacheModel =
  (models.ShopifyArtworkCache as Model<ShopifyArtworkCache>) ||
  model<ShopifyArtworkCache>("ShopifyArtworkCache", shopifyArtworkCacheSchema);

export type { ShopifyArtworkCache };
