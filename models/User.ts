import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const userRoles = ["team", "artist"] as const;

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    role: { type: String, enum: userRoles, required: true },
    artistId: { type: Schema.Types.ObjectId, ref: "Artist" },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

type User = InferSchemaType<typeof userSchema>;
export type UserRole = (typeof userRoles)[number];

export const UserModel = (models.User as Model<User>) || model<User>("User", userSchema);

export type { User };
