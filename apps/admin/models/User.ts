import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const userRoles = ["admin", "team", "artist", "customer"] as const;
export const userAccountSources = ["self_registered", "app_native", "admin_provisioned", "legacy_import"] as const;

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    role: { type: String, enum: userRoles, required: true },
    name: { type: String, trim: true },
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    shopifyCustomerGid: { type: String, trim: true },
    artistId: { type: Schema.Types.ObjectId, ref: "Artist" },
    artistKey: { type: String, trim: true },
    onboardingComplete: { type: Boolean, default: false },
    pendingRegistrationId: { type: Schema.Types.ObjectId, ref: "ArtistApplication" },
    onboardingStatus: { type: String, enum: ["pending", "accepted", "rejected"] },
    accountSource: { type: String, enum: userAccountSources },
    registrationAttemptId: { type: String, trim: true, select: false },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ registrationAttemptId: 1 }, { unique: true, partialFilterExpression: { registrationAttemptId: { $type: "string" } } });
userSchema.index({ shopDomain: 1, artistKey: 1 }, { unique: true, partialFilterExpression: { artistKey: { $type: "string" } } });

type User = InferSchemaType<typeof userSchema>;
export type UserRole = (typeof userRoles)[number];

export const UserModel = (models.User as Model<User>) || model<User>("User", userSchema);

export type { User };
