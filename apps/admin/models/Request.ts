import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

export const requestStatuses = ["draft", "submitted", "in_review", "approved", "rejected", "applied"] as const;
export const requestTypes = ["artwork_create", "payout_update", "profile_update"] as const;

const requestSchema = new Schema(
  {
    artistId: { type: Types.ObjectId, ref: "Artist", required: true },
    type: { type: String, enum: requestTypes, required: true },
    status: { type: String, enum: requestStatuses, default: "submitted" },
    payload: { type: Schema.Types.Mixed, default: {} },
    result: {
      shopifyProductId: { type: String },
      shopifyAdminUrl: { type: String },
    },
    createdByUserId: { type: Types.ObjectId, ref: "User", required: true },
    reviewerUserId: { type: Types.ObjectId, ref: "User" },
    reviewerNote: { type: String },
    appliedAt: { type: Date },
  },
  { timestamps: true },
);

type RequestDoc = InferSchemaType<typeof requestSchema>;

export const RequestModel = (models.Request as Model<RequestDoc>) || model<RequestDoc>("Request", requestSchema);
export type { RequestDoc };
