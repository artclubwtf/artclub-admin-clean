import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const syncStateScopes = ["shopify_pull_products", "shopify_pull_artists", "shopify_push"] as const;

const syncStateSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    scope: { type: String, enum: syncStateScopes, required: true },
    cursor: { type: String },
    lastRunAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

syncStateSchema.index({ shopDomain: 1, scope: 1 }, { unique: true });

type SyncState = InferSchemaType<typeof syncStateSchema>;
export type SyncStateScope = (typeof syncStateScopes)[number];

export const SyncStateModel =
  (models.SyncState as Model<SyncState>) || model<SyncState>("SyncState", syncStateSchema);

export type { SyncState };
