import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const orderLineOverrideSources = ["shopify", "pos"] as const;
export const orderLineOverrideSaleTypes = ["print", "original", "unknown"] as const;

const orderLineOverrideSchema = new Schema(
  {
    orderSource: { type: String, enum: orderLineOverrideSources, required: true },
    shopifyOrderGid: { type: String },
    posOrderId: { type: String },
    lineKey: { type: String, required: true },
    overrideArtistMetaobjectGid: { type: String },
    overrideSaleType: { type: String, enum: orderLineOverrideSaleTypes },
    overrideGross: { type: Number },
  },
  { timestamps: true, collection: "order_line_overrides" },
);

type OrderLineOverride = InferSchemaType<typeof orderLineOverrideSchema>;

export const OrderLineOverrideModel =
  (models.OrderLineOverride as Model<OrderLineOverride>) ||
  model<OrderLineOverride>("OrderLineOverride", orderLineOverrideSchema);

export type { OrderLineOverride };
