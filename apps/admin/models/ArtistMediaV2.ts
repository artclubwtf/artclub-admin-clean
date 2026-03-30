import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

export const artistMediaV2Kinds = ["artwork", "gallery", "avatar", "hero", "other"] as const;

const artistMediaV2Schema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    userId: { type: Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: artistMediaV2Kinds, default: "artwork", required: true },
    fileIdGid: { type: String, trim: true },
    filename: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    sizeBytes: { type: Number },
    url: { type: String, required: true, trim: true },
    previewUrl: { type: String, trim: true },
  },
  { timestamps: true },
);

artistMediaV2Schema.index({ shopDomain: 1, artistKey: 1, createdAt: -1 });

type ArtistMediaV2 = InferSchemaType<typeof artistMediaV2Schema>;

export const ArtistMediaV2Model =
  (models.ArtistMediaV2 as Model<ArtistMediaV2>) || model<ArtistMediaV2>("ArtistMediaV2", artistMediaV2Schema);

export type { ArtistMediaV2 };
