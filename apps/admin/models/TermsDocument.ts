import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const termsDocumentSchema = new Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true },
    key: { type: String, required: true, trim: true, unique: true },
    title: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    activeVersionId: { type: Types.ObjectId, ref: "TermsVersion" },
  },
  { timestamps: true },
);

termsDocumentSchema.index({ key: 1 }, { unique: true });
termsDocumentSchema.index({ slug: 1 }, { unique: true });
termsDocumentSchema.index({ isActive: 1, slug: 1 });

termsDocumentSchema.pre("validate", function syncSlugAndKey() {
  const valueFromSlug = typeof this.slug === "string" ? this.slug.trim().toLowerCase() : "";
  const valueFromKey = typeof this.key === "string" ? this.key.trim().toLowerCase() : "";
  const resolved = valueFromSlug || valueFromKey;

  if (!resolved) {
    throw new Error("terms_document_slug_required");
  }

  this.slug = resolved;
  this.key = resolved;
});

type TermsDocument = InferSchemaType<typeof termsDocumentSchema>;

export const TermsDocumentModel =
  (models.TermsDocument as Model<TermsDocument>) || model<TermsDocument>("TermsDocument", termsDocumentSchema);
export type { TermsDocument };
