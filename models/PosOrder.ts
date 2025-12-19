import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const posSaleTypes = ["print", "original", "unknown"] as const;

const posOrderLineItemSchema = new Schema(
  {
    title: { type: String, required: true },
    shopifyProductGid: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    saleType: { type: String, enum: posSaleTypes, default: "unknown" },
    artistShopifyMetaobjectGid: { type: String },
    artistMongoId: { type: String },
  },
  { _id: false },
);

const posTotalsSchema = new Schema(
  {
    gross: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
  },
  { _id: false },
);

const posOrderSchema = new Schema(
  {
    source: { type: String, enum: ["pos"], default: "pos", required: true },
    createdBy: { type: String },
    note: { type: String },
    lineItems: { type: [posOrderLineItemSchema], default: [] },
    totals: { type: posTotalsSchema, required: true },
  },
  { timestamps: true, collection: "pos_orders" },
);

type PosOrder = InferSchemaType<typeof posOrderSchema>;

export const PosOrderModel = (models.PosOrder as Model<PosOrder>) || model<PosOrder>("PosOrder", posOrderSchema);
export type { PosOrder };
