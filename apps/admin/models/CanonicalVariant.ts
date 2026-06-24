import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { canonicalStatusValues } from "./canonicalStates";

const canonicalVariantInventorySchema = new Schema(
  {
    tracked: { type: Boolean, default: true },
    quantity: { type: Number },
    locationId: { type: String, trim: true },
    availableQuantity: { type: Number },
    initialQuantity: { type: Number },
    inventorySeededAt: { type: Date },
    inventorySeedJobId: { type: String, trim: true },
    inventorySeedStatus: { type: String, trim: true },
    replenishmentDisabled: { type: Boolean, default: true },
    editionLimit: { type: Number },
    lastInventorySyncAt: { type: Date },
    inventorySyncStatus: { type: String, trim: true },
    lastInventoryError: { type: String },
  },
  { _id: false },
);

const canonicalVariantShopifySchema = new Schema(
  {
    variantGid: { type: String },
    inventoryItemGid: { type: String },
    inventorySku: { type: String },
  },
  { _id: false },
);

const canonicalVariantSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    productKey: { type: String, required: true, trim: true },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    variantKey: { type: String, required: true, trim: true },
    finish: { type: String, required: true, trim: true },
    sizeCode: { type: String, required: true, trim: true },
    size: { type: String, trim: true },
    sku: { type: String, required: true, trim: true },
    priceCents: { type: Number, required: true },
    shopifyVariantId: { type: String, trim: true },
    published: { type: Boolean, default: false },
    syncState: { type: String, enum: canonicalStatusValues },
    inventory: { type: canonicalVariantInventorySchema, default: () => ({ tracked: true }) },
    shopify: { type: canonicalVariantShopifySchema, default: () => ({}) },
  },
  { timestamps: true },
);

canonicalVariantSchema.index({ shopDomain: 1, productKey: 1, variantKey: 1 }, { unique: true });
canonicalVariantSchema.index(
  { shopDomain: 1, shopifyVariantId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      shopifyVariantId: { $type: "string" },
    },
  },
);

type CanonicalVariant = InferSchemaType<typeof canonicalVariantSchema>;

export const CanonicalVariantModel =
  (models.CanonicalVariant as Model<CanonicalVariant>) ||
  model<CanonicalVariant>("CanonicalVariant", canonicalVariantSchema);

export type { CanonicalVariant };
