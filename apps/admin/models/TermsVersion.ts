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
    documentSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    version: { type: Number, required: true },
    status: { type: String, enum: termsVersionStatuses, default: "draft" },
    effectiveAt: { type: Date },
    bodyMarkdown: { type: String, default: "" },
    content: { type: termsContentSchema, default: () => ({}) },
    changelog: { type: String },
    createdByAdminId: { type: Types.ObjectId, ref: "User" },
    createdByUserId: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

termsVersionSchema.index({ documentId: 1, version: 1 }, { unique: true });
termsVersionSchema.index({ documentSlug: 1, version: 1 }, { unique: true });
termsVersionSchema.index({ documentId: 1, status: 1 });
termsVersionSchema.index({ documentSlug: 1, status: 1 });

termsVersionSchema.pre("validate", function syncLegacyAndV2Fields() {
  if (typeof this.documentSlug === "string") {
    this.documentSlug = this.documentSlug.trim().toLowerCase();
  }

  if (this.createdByAdminId && !this.createdByUserId) {
    this.createdByUserId = this.createdByAdminId;
  } else if (this.createdByUserId && !this.createdByAdminId) {
    this.createdByAdminId = this.createdByUserId;
  }

  const markdown = typeof this.bodyMarkdown === "string" ? this.bodyMarkdown : "";
  if (markdown && (!this.content || !this.content.fullMarkdown)) {
    if (!this.content) this.content = { summaryMarkdown: "", fullMarkdown: "", blocks: [] };
    this.content.fullMarkdown = markdown;
  } else if (!markdown && this.content?.fullMarkdown) {
    this.bodyMarkdown = this.content.fullMarkdown;
  }
});

type TermsVersion = InferSchemaType<typeof termsVersionSchema>;

export const TermsVersionModel =
  (models.TermsVersion as Model<TermsVersion>) || model<TermsVersion>("TermsVersion", termsVersionSchema);
export type { TermsVersion };
