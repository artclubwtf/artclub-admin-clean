import { InferSchemaType, Model, Schema, model, models, Types } from "mongoose";

export const artistApplicationStatuses = ["draft", "submitted", "in_review", "accepted", "rejected"] as const;

const artistApplicationSchema = new Schema(
  {
    status: { type: String, enum: artistApplicationStatuses, default: "draft" },
    applicationTokenHash: { type: String, required: true },
    expiresAt: { type: Date },
    linkedArtistId: { type: Types.ObjectId, ref: "Artist" },
    shopifyMetaobjectId: { type: String },
    createdProductIds: { type: [String], default: [] },
    personal: {
      fullName: { type: String },
      email: { type: String },
      phone: { type: String },
      city: { type: String },
      country: { type: String },
    },
    shopify: {
      instagramUrl: { type: String },
      quote: { type: String },
      einleitung_1: { type: String },
      text_1: { type: String },
      kategorieCollectionGid: { type: String },
    },
    profileImages: {
      titelbildGid: { type: String },
      bild1Gid: { type: String },
      bild2Gid: { type: String },
      bild3Gid: { type: String },
    },
    legal: {
      termsVersion: { type: String },
      acceptedAt: { type: Date },
      acceptedIp: { type: String },
      acceptedUserAgent: { type: String },
      acceptedName: { type: String },
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    acceptedAt: { type: Date },
    admin: {
      reviewerNote: { type: String },
      decisionNote: { type: String },
    },
  },
  { timestamps: true },
);

artistApplicationSchema.index({ applicationTokenHash: 1 });

type ArtistApplication = InferSchemaType<typeof artistApplicationSchema>;

export const ArtistApplicationModel =
  (models.ArtistApplication as Model<ArtistApplication>) || model<ArtistApplication>("ArtistApplication", artistApplicationSchema);
export type { ArtistApplication };
