import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const userSavedSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productGid: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "user_saved" },
);

userSavedSchema.index({ userId: 1, productGid: 1 }, { unique: true });
userSavedSchema.index({ userId: 1, createdAt: -1 });

type UserSaved = InferSchemaType<typeof userSavedSchema>;

export const UserSavedModel =
  (models.UserSaved as Model<UserSaved>) || model<UserSaved>("UserSaved", userSavedSchema);

export type { UserSaved };
