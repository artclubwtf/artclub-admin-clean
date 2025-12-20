import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const threadSchema = new Schema(
  {
    artistId: { type: Types.ObjectId, ref: "Artist", required: true, unique: true },
    lastMessageAt: { type: Date },
  },
  { timestamps: true },
);

type MessageThread = InferSchemaType<typeof threadSchema>;

export const MessageThreadModel =
  (models.MessageThread as Model<MessageThread>) || model<MessageThread>("MessageThread", threadSchema);
export type { MessageThread };
