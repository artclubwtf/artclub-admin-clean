import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

import { posVatRates } from "@/models/PosItem";

export const posTransactionStatuses = [
  "created",
  "payment_pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "storno",
] as const;

export const posBuyerTypes = ["b2c", "b2b"] as const;
export const posPaymentMethods = ["card", "cash", "other"] as const;

const isInteger = {
  validator: Number.isInteger,
  message: "must be an integer",
};

const posTransactionItemSchema = new Schema(
  {
    itemId: { type: Types.ObjectId, ref: "POSItem", required: true },
    qty: { type: Number, required: true, min: 1, validate: isInteger },
    unitGrossCents: { type: Number, required: true, min: 0, validate: isInteger },
    vatRate: { type: Number, enum: posVatRates, required: true },
    titleSnapshot: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const posTransactionTotalsSchema = new Schema(
  {
    grossCents: { type: Number, required: true, min: 0, validate: isInteger },
    vatCents: { type: Number, required: true, min: 0, validate: isInteger },
    netCents: { type: Number, required: true, min: 0, validate: isInteger },
  },
  { _id: false },
);

const posTransactionBuyerSchema = new Schema(
  {
    type: { type: String, enum: posBuyerTypes, required: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    vatId: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
  },
  { _id: false },
);

const posTransactionPaymentSchema = new Schema(
  {
    provider: { type: String, required: true, trim: true },
    providerTxId: { type: String, trim: true },
    method: { type: String, enum: posPaymentMethods, required: true },
    tipCents: { type: Number, min: 0, validate: isInteger },
    approvedAt: { type: Date },
  },
  { _id: false },
);

const posTransactionSchema = new Schema(
  {
    locationId: { type: Types.ObjectId, ref: "POSLocation", required: true },
    terminalId: { type: Types.ObjectId, ref: "POSTerminal" },
    status: { type: String, enum: posTransactionStatuses, default: "created", required: true },
    items: {
      type: [posTransactionItemSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length > 0,
        message: "at least one item is required",
      },
    },
    totals: { type: posTransactionTotalsSchema, required: true },
    buyer: { type: posTransactionBuyerSchema, required: true },
    payment: { type: posTransactionPaymentSchema, required: true },
    receipt: {
      receiptNo: { type: String, trim: true },
      pdfUrl: { type: String, trim: true },
    },
    invoice: {
      invoiceNo: { type: String, trim: true },
      pdfUrl: { type: String, trim: true },
    },
    contract: {
      contractId: { type: Types.ObjectId, ref: "Contract" },
      pdfUrl: { type: String, trim: true },
    },
    tse: {
      provider: { type: String, trim: true },
      txId: { type: String, trim: true },
      signature: { type: String, trim: true },
      serial: { type: String, trim: true },
      startedAt: { type: Date },
      finishedAt: { type: Date },
    },
    createdByAdminId: { type: Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "pos_transactions" },
);

posTransactionSchema.index({ createdAt: -1 });
posTransactionSchema.index({ status: 1, createdAt: -1 });
posTransactionSchema.index({ locationId: 1, createdAt: -1 });
posTransactionSchema.index({ terminalId: 1, createdAt: -1 });

type PosTransaction = InferSchemaType<typeof posTransactionSchema>;

export const POSTransactionModel =
  (models.POSTransaction as Model<PosTransaction>) || model<PosTransaction>("POSTransaction", posTransactionSchema);
export const PosTransactionModel = POSTransactionModel;

export type { PosTransaction };
