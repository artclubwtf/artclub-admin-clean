import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const userReactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productGid: { type: String, required: true },
    emoji: { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: "user_reactions" },
);

userReactionSchema.index({ userId: 1, productGid: 1 }, { unique: true });

type UserReaction = InferSchemaType<typeof userReactionSchema>;

export const UserReactionModel =
  (models.UserReaction as Model<UserReaction>) || model<UserReaction>("UserReaction", userReactionSchema);

export type { UserReaction };
