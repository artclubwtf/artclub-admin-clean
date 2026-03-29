import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const canonicalVariantInventorySchema = new Schema(
  {
    tracked: { type: Boolean, default: true },
  },
  { _id: false },
);

const canonicalVariantShopifySchema = new Schema(
  {
    variantGid: { type: String },
    inventoryItemGid: { type: String },
  },
  { _id: false },
);

const canonicalVariantSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    productKey: { type: String, required: true, trim: true },
    variantKey: { type: String, required: true, trim: true },
    finish: { type: String, required: true, trim: true },
    sizeCode: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    priceCents: { type: Number, required: true },
    inventory: { type: canonicalVariantInventorySchema, default: () => ({ tracked: true }) },
    shopify: { type: canonicalVariantShopifySchema, default: () => ({}) },
  },
  { timestamps: true },
);

canonicalVariantSchema.index({ shopDomain: 1, productKey: 1, variantKey: 1 }, { unique: true });

type CanonicalVariant = InferSchemaType<typeof canonicalVariantSchema>;

export const CanonicalVariantModel =
  (models.CanonicalVariant as Model<CanonicalVariant>) ||
  model<CanonicalVariant>("CanonicalVariant", canonicalVariantSchema);

export type { CanonicalVariant };
