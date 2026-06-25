import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const orderSaleTypes = ["print", "original", "unknown"] as const;
export const orderPayoutStatuses = ["pending", "eligible", "paid", "partially_refunded", "refunded", "cancelled"] as const;

const shopifyOrderLineItemSchema = new Schema(
  {
    lineId: { type: String },
    productKey: { type: String },
    title: { type: String, required: true },
    variantTitle: { type: String },
    shopifyVariantId: { type: String },
    shopifyVariantGid: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    refundedQuantity: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    shopifyProductId: { type: String },
    shopifyProductGid: { type: String },
    productHandle: { type: String },
    vendor: { type: String },
    productTags: { type: [String], default: [] },
    artistMetaobjectGid: { type: String },
    inferredSaleType: { type: String, enum: orderSaleTypes, default: "unknown" },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: "CanonicalProduct" },
    canonicalArtistId: { type: Schema.Types.ObjectId, ref: "CanonicalArtist" },
    artistShare: { type: Number },
    estimatedArtistShare: { type: Number },
    payoutStatus: { type: String, enum: orderPayoutStatuses, default: "pending" },
  },
  { _id: false },
);

const saleTypeBreakdownSchema = new Schema(
  {
    printGross: { type: Number, default: 0 },
    originalGross: { type: Number, default: 0 },
  },
  { _id: false },
);

const allocationSchema = new Schema(
  {
    artistMetaobjectGid: { type: String, required: true },
    gross: { type: Number, required: true },
    saleTypeBreakdown: { type: saleTypeBreakdownSchema, default: () => ({}) },
  },
  { _id: false },
);

const shopifyOrderCacheSchema = new Schema(
  {
    shopDomain: { type: String, lowercase: true, trim: true },
    source: { type: String, enum: ["shopify"], default: "shopify", required: true },
    shopifyOrderId: { type: String },
    shopifyOrderGid: { type: String, required: true, unique: true },
    orderName: { type: String, required: true },
    createdAt: { type: Date, required: true },
    processedAt: { type: Date },
    financialStatus: { type: String },
    cancelledAt: { type: Date },
    refundedAmount: { type: Number },
    refundedTotalGross: { type: Number },
    fulfillmentStatus: { type: String },
    currency: { type: String, default: "EUR" },
    totalGross: { type: Number, required: true },
    lineItems: { type: [shopifyOrderLineItemSchema], default: [] },
    allocations: { type: [allocationSchema], default: [] },
    lastImportedAt: { type: Date },
  },
  { timestamps: true, collection: "shopify_orders_cache" },
);

shopifyOrderCacheSchema.index({ createdAt: -1 });
shopifyOrderCacheSchema.index({ shopDomain: 1, createdAt: -1 });
shopifyOrderCacheSchema.index({ "lineItems.canonicalArtistId": 1, createdAt: -1 });
shopifyOrderCacheSchema.index({ "lineItems.canonicalProductId": 1, createdAt: -1 });

type ShopifyOrderCache = InferSchemaType<typeof shopifyOrderCacheSchema>;

export const ShopifyOrderCacheModel =
  (models.ShopifyOrderCache as Model<ShopifyOrderCache>) ||
  model<ShopifyOrderCache>("ShopifyOrderCache", shopifyOrderCacheSchema);

export type { ShopifyOrderCache };
