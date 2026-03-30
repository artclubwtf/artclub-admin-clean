import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const artistWorkspaceThreadSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    userId: { type: Types.ObjectId, ref: "User", required: true },
    lastMessageAt: { type: Date },
  },
  { timestamps: true },
);

artistWorkspaceThreadSchema.index({ shopDomain: 1, artistKey: 1 }, { unique: true });

type ArtistWorkspaceThread = InferSchemaType<typeof artistWorkspaceThreadSchema>;

export const ArtistWorkspaceThreadModel =
  (models.ArtistWorkspaceThread as Model<ArtistWorkspaceThread>) ||
  model<ArtistWorkspaceThread>("ArtistWorkspaceThread", artistWorkspaceThreadSchema);

export type { ArtistWorkspaceThread };
