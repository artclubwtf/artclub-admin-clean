import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

export const posCommandTypes = ["zvt_payment", "zvt_abort", "ping"] as const;
export const posCommandStatuses = ["queued", "sent", "done", "failed"] as const;

const posCommandSchema = new Schema(
  {
    agentId: { type: Types.ObjectId, ref: "POSAgent", required: true },
    type: { type: String, enum: posCommandTypes, required: true },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    status: { type: String, enum: posCommandStatuses, required: true, default: "queued" },
  },
  { timestamps: true, collection: "pos_commands" },
);

posCommandSchema.index({ agentId: 1, status: 1, createdAt: 1 });
posCommandSchema.index({ createdAt: -1 });

type PosCommand = InferSchemaType<typeof posCommandSchema>;

export const POSCommandModel = (models.POSCommand as Model<PosCommand>) || model<PosCommand>("POSCommand", posCommandSchema);
export const PosCommandModel = POSCommandModel;

export type { PosCommand };
