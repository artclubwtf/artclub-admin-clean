import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";
import {
  workspaceConversationStatuses,
  workspaceConversationTypes,
  workspaceSenderRoles,
} from "@artclub/models";

const artistWorkspaceThreadSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    userId: { type: Types.ObjectId, ref: "User", required: true },
    subject: { type: String, trim: true, default: "" },
    type: {
      type: String,
      enum: workspaceConversationTypes.options,
      default: workspaceConversationTypes.enum.general,
    },
    status: {
      type: String,
      enum: workspaceConversationStatuses.options,
      default: workspaceConversationStatuses.enum.open,
    },
    references: [
      new Schema(
        {
          kind: { type: String, required: true, trim: true },
          refId: { type: String, required: true, trim: true },
          label: { type: String, trim: true },
        },
        { _id: false },
      ),
    ],
    artistLastReadAt: { type: Date },
    teamLastReadAt: { type: Date },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, trim: true },
    lastMessageSenderRole: {
      type: String,
      enum: workspaceSenderRoles.options,
    },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

artistWorkspaceThreadSchema.index(
  { shopDomain: 1, artistKey: 1, lastMessageAt: -1, createdAt: -1 },
  { name: "artistWorkspaceThread_owner_lastMessageAt" },
);
artistWorkspaceThreadSchema.index(
  { shopDomain: 1, artistKey: 1, type: 1, status: 1, lastMessageAt: -1 },
  { name: "artistWorkspaceThread_owner_type_status" },
);

type ArtistWorkspaceThread = InferSchemaType<typeof artistWorkspaceThreadSchema>;

export const ArtistWorkspaceThreadModel =
  (models.ArtistWorkspaceThread as Model<ArtistWorkspaceThread>) ||
  model<ArtistWorkspaceThread>("ArtistWorkspaceThread", artistWorkspaceThreadSchema);

export type { ArtistWorkspaceThread };
