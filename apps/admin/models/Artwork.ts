import { InferSchemaType, Model, Schema, model, models, Types } from "mongoose";

export const artworkSaleTypes = ["print", "original", "both"] as const;

const artworkImageSchema = new Schema(
  {
    mediaId: { type: Types.ObjectId, ref: "Media", required: true },
    url: { type: String },
    s3Key: { type: String },
    filename: { type: String },
  },
  { _id: false },
);

const artworkSchema = new Schema(
  {
    artistId: { type: Types.ObjectId, ref: "Artist", required: true },
    title: { type: String, required: true },
    description: { type: String },
    saleType: { type: String, enum: artworkSaleTypes, required: true },
    price: { type: Number },
    currency: { type: String, default: "EUR" },
    editionSize: { type: Number },
    images: [artworkImageSchema],
    shopify: {
      productId: { type: String },
      handle: { type: String },
      lastPushedAt: { type: Date },
      lastPushError: { type: String },
    },
    status: { type: String, enum: ["draft", "pushed"], default: "draft" },
  },
  { timestamps: true },
);

type Artwork = InferSchemaType<typeof artworkSchema>;

export const ArtworkModel = (models.Artwork as Model<Artwork>) || model<Artwork>("Artwork", artworkSchema);
export type { Artwork };
