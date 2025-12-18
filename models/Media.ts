import { InferSchemaType, Model, Schema, model, models, Types } from "mongoose";

export const mediaKinds = ["artwork", "social", "other"] as const;

const mediaSchema = new Schema(
  {
    artistId: { type: Types.ObjectId, ref: "Artist", required: true },
    kind: { type: String, enum: mediaKinds, required: true },
    filename: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    s3Key: { type: String, required: true },
    url: { type: String },
  },
  { timestamps: true },
);

type Media = InferSchemaType<typeof mediaSchema>;

export const MediaModel = (models.Media as Model<Media>) || model<Media>("Media", mediaSchema);
export type { Media };
