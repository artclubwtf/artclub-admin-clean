import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

export const termsVersionStatuses = ["draft", "published", "archived"] as const;

const termsContentSchema = new Schema(
  {
    summaryMarkdown: { type: String, default: "" },
    fullMarkdown: { type: String, default: "" },
    blocks: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false },
);

const termsVersionSchema = new Schema(
  {
    documentId: { type: Types.ObjectId, ref: "TermsDocument", required: true, index: true },
    version: { type: Number, required: true },
    status: { type: String, enum: termsVersionStatuses, default: "draft" },
    effectiveAt: { type: Date },
    content: { type: termsContentSchema, default: () => ({}) },
    changelog: { type: String },
    createdByUserId: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

termsVersionSchema.index({ documentId: 1, version: 1 }, { unique: true });
termsVersionSchema.index({ documentId: 1, status: 1 });

type TermsVersion = InferSchemaType<typeof termsVersionSchema>;

export const TermsVersionModel =
  (models.TermsVersion as Model<TermsVersion>) || model<TermsVersion>("TermsVersion", termsVersionSchema);
export type { TermsVersion };
