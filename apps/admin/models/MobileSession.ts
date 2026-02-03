import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const mobileSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "mobile_sessions" },
);

mobileSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
mobileSessionSchema.index({ userId: 1 });

type MobileSession = InferSchemaType<typeof mobileSessionSchema>;

export const MobileSessionModel =
  (models.MobileSession as Model<MobileSession>) || model<MobileSession>("MobileSession", mobileSessionSchema);

export type { MobileSession };
