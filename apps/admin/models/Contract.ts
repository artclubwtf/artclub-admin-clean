import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { z } from "zod";

export const contractTypes = ["artist_contract", "consignment", "nda", "other"] as const;

export const createContractSchema = z.object({
  kunstlerId: z.string().min(1, "kunstlerId is required"),
  contractType: z.enum(contractTypes).default("artist_contract"),
  filename: z.string().optional(),
  s3Key: z.string().min(1, "s3Key is required"),
  s3Url: z.string().url().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  signedAt: z.coerce.date().optional(),
});

export const updateContractSchema = createContractSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

const contractSchema = new Schema(
  {
    kunstlerId: { type: String, required: true },
    contractType: { type: String, enum: contractTypes, default: "artist_contract" },
    filename: { type: String },
    s3Key: { type: String, required: true },
    s3Url: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    signedAt: { type: Date },
  },
  { timestamps: true },
);

type Contract = InferSchemaType<typeof contractSchema>;

export const ContractModel = (models.Contract as Model<Contract>) || model<Contract>("Contract", contractSchema);
export type { Contract };
