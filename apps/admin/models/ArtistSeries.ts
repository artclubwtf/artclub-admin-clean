import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const artistSeriesSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    userId: { type: Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
  },
  { timestamps: true },
);

artistSeriesSchema.index({ shopDomain: 1, artistKey: 1, createdAt: -1 });
artistSeriesSchema.index({ shopDomain: 1, artistKey: 1, name: 1 });

type ArtistSeries = InferSchemaType<typeof artistSeriesSchema>;

export const ArtistSeriesModel =
  (models.ArtistSeries as Model<ArtistSeries>) || model<ArtistSeries>("ArtistSeries", artistSeriesSchema);

export type { ArtistSeries };
