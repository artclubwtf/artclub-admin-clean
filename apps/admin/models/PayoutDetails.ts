import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { z } from "zod";

export const createPayoutDetailsSchema = z.object({
  kunstlerId: z.string().min(1, "kunstlerId is required"),
  accountHolder: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  bankName: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
});

export const updatePayoutDetailsSchema = createPayoutDetailsSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

const payoutDetailsSchema = new Schema(
  {
    kunstlerId: { type: String, required: true, unique: true },
    accountHolder: { type: String },
    iban: { type: String },
    bic: { type: String },
    bankName: { type: String },
    address: { type: String },
    taxId: { type: String },
  },
  { timestamps: true },
);

type PayoutDetails = InferSchemaType<typeof payoutDetailsSchema>;

export const PayoutDetailsModel =
  (models.PayoutDetails as Model<PayoutDetails>) || model<PayoutDetails>("PayoutDetails", payoutDetailsSchema);
export type { PayoutDetails };
