import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const posContractSchema = new Schema(
  {
    txId: { type: Types.ObjectId, ref: "POSTransaction", required: true, unique: true },
    fieldsSnapshot: { type: Schema.Types.Mixed, required: true, default: {} },
    buyerSignatureImageUrl: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "pos_contracts" },
);

posContractSchema.index({ txId: 1 }, { unique: true });
posContractSchema.index({ createdAt: -1 });

type PosContract = InferSchemaType<typeof posContractSchema>;

export const POSContractModel =
  (models.POSContract as Model<PosContract>) || model<PosContract>("POSContract", posContractSchema);
export const PosContractModel = POSContractModel;

export type { PosContract };
