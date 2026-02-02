import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const payoutMethods = ["bank", "cash", "other"] as const;

const payoutTransactionSchema = new Schema(
  {
    artistMongoId: { type: String, required: true },
    artistMetaobjectGid: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    method: { type: String, enum: payoutMethods, required: true },
    reference: { type: String },
    note: { type: String },
  },
  { timestamps: true, collection: "payout_transactions" },
);

type PayoutTransaction = InferSchemaType<typeof payoutTransactionSchema>;

export const PayoutTransactionModel =
  (models.PayoutTransaction as Model<PayoutTransaction>) ||
  model<PayoutTransaction>("PayoutTransaction", payoutTransactionSchema);

export type { PayoutTransaction };
