import { InferSchemaType, Model, Schema, model, models, Types } from "mongoose";

export const mediaKinds = ["artwork", "social", "other"] as const;
export const mediaOwnerTypes = ["artist", "application"] as const;

const mediaSchema = new Schema(
  {
    ownerType: { type: String, enum: mediaOwnerTypes, default: "artist", required: true },
    ownerId: {
      type: Types.ObjectId,
      default: function (this: { ownerType?: string; artistId?: Types.ObjectId }) {
        if (this.ownerType && this.ownerType !== "artist") return undefined;
        return this.artistId;
      },
      required: function (this: { ownerType?: string }) {
        return this.ownerType === "application";
      },
    },
    artistId: {
      type: Types.ObjectId,
      ref: "Artist",
      required: function (this: { ownerType?: string }) {
        return this.ownerType === "artist";
      },
    },
    kind: { type: String, enum: mediaKinds, required: true },
    filename: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    s3Key: { type: String, required: true },
    url: { type: String },
    previewUrl: { type: String },
  },
  { timestamps: true },
);

mediaSchema.pre(
  "validate",
  function (this: { ownerType?: string; ownerId?: Types.ObjectId; artistId?: Types.ObjectId }) {
    if (!this.ownerType) this.ownerType = "artist";
    if (!this.ownerId && this.ownerType === "artist" && this.artistId) {
      this.ownerId = this.artistId;
    }
  },
);

type Media = InferSchemaType<typeof mediaSchema>;

export const MediaModel = (models.Media as Model<Media>) || model<Media>("Media", mediaSchema);
export type { Media };
