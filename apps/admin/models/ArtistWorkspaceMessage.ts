import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";
import { workspaceSenderRoles } from "@artclub/models";

export const artistWorkspaceSenderRoles = workspaceSenderRoles.options;

const artistWorkspaceMessageSchema = new Schema(
  {
    threadId: { type: Types.ObjectId, ref: "ArtistWorkspaceThread", required: true },
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    senderRole: { type: String, enum: artistWorkspaceSenderRoles, required: true },
    senderUserId: { type: Types.ObjectId, ref: "User" },
    senderLabel: { type: String, trim: true },
    text: { type: String, default: "" },
    mediaIds: [{ type: Types.ObjectId, ref: "ArtistMediaV2" }],
  },
  { timestamps: true },
);

artistWorkspaceMessageSchema.index({ threadId: 1, createdAt: -1 });

type ArtistWorkspaceMessage = InferSchemaType<typeof artistWorkspaceMessageSchema>;

export const ArtistWorkspaceMessageModel =
  (models.ArtistWorkspaceMessage as Model<ArtistWorkspaceMessage>) ||
  model<ArtistWorkspaceMessage>("ArtistWorkspaceMessage", artistWorkspaceMessageSchema);

export type { ArtistWorkspaceMessage };
