import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const userRoles = ["team", "artist", "customer"] as const;

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    role: { type: String, enum: userRoles, required: true },
    name: { type: String, trim: true },
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    shopifyCustomerGid: { type: String, trim: true },
    artistId: { type: Schema.Types.ObjectId, ref: "Artist" },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ email: 1, shopDomain: 1 }, { unique: true });

type User = InferSchemaType<typeof userSchema>;
export type UserRole = (typeof userRoles)[number];

export const UserModel = (models.User as Model<User>) || model<User>("User", userSchema);

export type { User };
