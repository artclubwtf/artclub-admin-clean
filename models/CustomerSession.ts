import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const customerSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

customerSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

type CustomerSession = InferSchemaType<typeof customerSessionSchema>;

export const CustomerSessionModel =
  (models.CustomerSession as Model<CustomerSession>) || model<CustomerSession>("CustomerSession", customerSessionSchema);

export type { CustomerSession };
