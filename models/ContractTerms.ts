import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const contractTermsSchema = new Schema(
  {
    kunstlerId: { type: String, required: true, unique: true },
    printCommissionPct: { type: Number, min: 0, max: 100, required: true },
    originalCommissionPct: { type: Number, min: 0, max: 100, required: true },
    effectiveFrom: { type: Date },
    notes: { type: String },
  },
  { timestamps: true, collection: "contract_terms" },
);

type ContractTerms = InferSchemaType<typeof contractTermsSchema>;

export const ContractTermsModel =
  (models.ContractTerms as Model<ContractTerms>) || model<ContractTerms>("ContractTerms", contractTermsSchema);

export type { ContractTerms };
