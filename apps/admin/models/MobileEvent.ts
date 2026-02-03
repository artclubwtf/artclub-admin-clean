import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const mobileEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    sessionId: { type: String },
    eventName: { type: String, required: true },
    productGid: { type: String },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: "mobile_events" },
);

mobileEventSchema.index({ createdAt: -1 });
mobileEventSchema.index({ eventName: 1 });
mobileEventSchema.index({ productGid: 1 });

type MobileEvent = InferSchemaType<typeof mobileEventSchema>;

export const MobileEventModel =
  (models.MobileEvent as Model<MobileEvent>) || model<MobileEvent>("MobileEvent", mobileEventSchema);

export type { MobileEvent };
