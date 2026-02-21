import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const posItemTypes = ["artwork", "event"] as const;
export const posVatRates = [0, 7, 19] as const;

const isInteger = {
  validator: Number.isInteger,
  message: "must be an integer",
};

const posItemSchema = new Schema(
  {
    type: { type: String, enum: posItemTypes, required: true },
    title: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    priceGrossCents: { type: Number, required: true, min: 0, validate: isInteger },
    vatRate: { type: Number, enum: posVatRates, required: true },
    currency: { type: String, enum: ["EUR"], default: "EUR", required: true },
    imageUrl: { type: String, trim: true },
    artistName: { type: String, trim: true },
    shopifyProductGid: { type: String, trim: true },
    shopifyVariantGid: { type: String, trim: true },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "pos_items" },
);

posItemSchema.index({ type: 1, isActive: 1, updatedAt: -1 });
posItemSchema.index({ sku: 1 }, { sparse: true, unique: true });
posItemSchema.index({ shopifyProductGid: 1 });
posItemSchema.index({ shopifyVariantGid: 1 });

type PosItem = InferSchemaType<typeof posItemSchema>;

export const POSItemModel = (models.POSItem as Model<PosItem>) || model<PosItem>("POSItem", posItemSchema);
export const PosItemModel = POSItemModel;

export type { PosItem };
