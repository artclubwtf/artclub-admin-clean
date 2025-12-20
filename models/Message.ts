import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

export const messageSenderRoles = ["artist", "team"] as const;

const messageSchema = new Schema(
  {
    threadId: { type: Types.ObjectId, ref: "MessageThread", required: true },
    artistId: { type: Types.ObjectId, ref: "Artist", required: true },
    senderRole: { type: String, enum: messageSenderRoles, required: true },
    text: { type: String, default: "" },
    mediaIds: [{ type: Types.ObjectId, ref: "Media" }],
  },
  { timestamps: true },
);

messageSchema.index({ threadId: 1, createdAt: -1 });

type Message = InferSchemaType<typeof messageSchema>;

export const MessageModel = (models.Message as Model<Message>) || model<Message>("Message", messageSchema);
export type { Message };
