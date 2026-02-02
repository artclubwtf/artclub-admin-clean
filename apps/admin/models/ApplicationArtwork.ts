import { InferSchemaType, Model, Schema, model, models, Types } from "mongoose";

export const applicationArtworkOfferings = ["print_only", "original_plus_prints"] as const;
export const applicationArtworkStatuses = ["draft", "submitted"] as const;

const applicationArtworkSchema = new Schema(
  {
    applicationId: { type: Types.ObjectId, ref: "ArtistApplication", required: true },
    title: { type: String, required: true },
    shortDescription: { type: String },
    widthCm: { type: Number },
    heightCm: { type: Number },
    offering: { type: String, enum: applicationArtworkOfferings, required: true },
    originalPriceEur: {
      type: Number,
      required: function (this: { offering?: string }) {
        return this.offering === "original_plus_prints";
      },
    },
    mediaIds: {
      type: [{ type: Types.ObjectId, ref: "Media" }],
      required: true,
      validate: {
        validator: (value: Types.ObjectId[]) => Array.isArray(value) && value.length > 0,
        message: "At least one media item is required",
      },
    },
    status: { type: String, enum: applicationArtworkStatuses },
    shopifyProductId: { type: String },
    shopifyAdminUrl: { type: String },
  },
  { timestamps: true },
);

type ApplicationArtwork = InferSchemaType<typeof applicationArtworkSchema>;

export const ApplicationArtworkModel =
  (models.ApplicationArtwork as Model<ApplicationArtwork>) ||
  model<ApplicationArtwork>("ApplicationArtwork", applicationArtworkSchema);
export type { ApplicationArtwork };
