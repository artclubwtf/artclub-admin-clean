import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const posAgentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    agentKey: { type: String, required: true, trim: true },
    locationLabel: { type: String, trim: true },
    lastSeenAt: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
    pairedTerminalId: { type: Types.ObjectId, ref: "POSTerminal" },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: "pos_agents" },
);

posAgentSchema.index({ agentKey: 1 }, { unique: true });
posAgentSchema.index({ isActive: 1, lastSeenAt: -1 });
posAgentSchema.index({ pairedTerminalId: 1 });

type PosAgent = InferSchemaType<typeof posAgentSchema>;

export const POSAgentModel = (models.POSAgent as Model<PosAgent>) || model<PosAgent>("POSAgent", posAgentSchema);
export const PosAgentModel = POSAgentModel;

export type { PosAgent };
