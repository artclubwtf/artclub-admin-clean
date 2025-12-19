import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const orderSaleTypes = ["print", "original", "unknown"] as const;

const shopifyOrderLineItemSchema = new Schema(
  {
    lineId: { type: String },
    title: { type: String, required: true },
    variantTitle: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    shopifyProductGid: { type: String },
    productTags: { type: [String], default: [] },
    artistMetaobjectGid: { type: String },
    inferredSaleType: { type: String, enum: orderSaleTypes, default: "unknown" },
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
    source: { type: String, enum: ["shopify"], default: "shopify", required: true },
    shopifyOrderGid: { type: String, required: true, unique: true },
    orderName: { type: String, required: true },
    createdAt: { type: Date, required: true },
    processedAt: { type: Date },
    financialStatus: { type: String },
    cancelledAt: { type: Date },
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

type ShopifyOrderCache = InferSchemaType<typeof shopifyOrderCacheSchema>;

export const ShopifyOrderCacheModel =
  (models.ShopifyOrderCache as Model<ShopifyOrderCache>) ||
  model<ShopifyOrderCache>("ShopifyOrderCache", shopifyOrderCacheSchema);

export type { ShopifyOrderCache };
