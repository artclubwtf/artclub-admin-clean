import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const termsDocumentSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, unique: true },
    title: { type: String, required: true, trim: true },
    activeVersionId: { type: Types.ObjectId, ref: "TermsVersion" },
  },
  { timestamps: true },
);

termsDocumentSchema.index({ key: 1 }, { unique: true });

type TermsDocument = InferSchemaType<typeof termsDocumentSchema>;

export const TermsDocumentModel =
  (models.TermsDocument as Model<TermsDocument>) || model<TermsDocument>("TermsDocument", termsDocumentSchema);
export type { TermsDocument };
