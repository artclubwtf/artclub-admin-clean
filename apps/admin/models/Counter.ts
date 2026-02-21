import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const counterScopes = ["receipt", "invoice", "audit_hash"] as const;

const counterSchema = new Schema(
  {
    scope: { type: String, enum: counterScopes, required: true },
    year: { type: Number, required: true, min: 2000 },
    value: { type: Number, required: true, min: 0, default: 0 },
    lastHash: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: "counters" },
);

counterSchema.index({ scope: 1, year: 1 }, { unique: true });

type Counter = InferSchemaType<typeof counterSchema>;

export const CounterModel = (models.Counter as Model<Counter>) || model<Counter>("Counter", counterSchema);

export type { Counter };
