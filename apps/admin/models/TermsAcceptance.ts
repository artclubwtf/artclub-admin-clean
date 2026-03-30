import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const termsAcceptanceSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    documentSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    version: { type: Number, required: true },
    versionId: { type: Types.ObjectId, ref: "TermsVersion" },
    acceptedAt: { type: Date, required: true, default: Date.now },
    acceptedName: { type: String, trim: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    snapshotHash: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

termsAcceptanceSchema.index({ userId: 1, documentSlug: 1, version: 1 }, { unique: true });
termsAcceptanceSchema.index({ userId: 1, acceptedAt: -1 });

type TermsAcceptance = InferSchemaType<typeof termsAcceptanceSchema>;

export const TermsAcceptanceModel =
  (models.TermsAcceptance as Model<TermsAcceptance>) || model<TermsAcceptance>("TermsAcceptance", termsAcceptanceSchema);

export type { TermsAcceptance };

