import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const posLocationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "pos_locations" },
);

posLocationSchema.index({ name: 1 });
posLocationSchema.index({ createdAt: -1 });

type PosLocation = InferSchemaType<typeof posLocationSchema>;

export const POSLocationModel =
  (models.POSLocation as Model<PosLocation>) || model<PosLocation>("POSLocation", posLocationSchema);
export const PosLocationModel = POSLocationModel;

export type { PosLocation };
