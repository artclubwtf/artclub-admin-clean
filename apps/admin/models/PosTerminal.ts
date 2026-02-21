import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const posTerminalSchema = new Schema(
  {
    locationId: { type: Types.ObjectId, ref: "POSLocation", required: true },
    provider: { type: String, required: true, trim: true },
    terminalRef: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    label: { type: String, required: true, trim: true },
    host: { type: String, trim: true },
    port: { type: Number, min: 1, max: 65535, default: 22000 },
    zvtPassword: { type: String, trim: true },
    mode: { type: String, enum: ["bridge", "external"], required: true, default: "bridge" },
    agentId: { type: Types.ObjectId, ref: "POSAgent" },
    isActive: { type: Boolean, required: true, default: true },
    status: { type: String, required: true, trim: true, default: "offline" },
    lastSeenAt: { type: Date },
  },
  { timestamps: true, collection: "pos_terminals" },
);

posTerminalSchema.index({ locationId: 1, status: 1 });
posTerminalSchema.index({ agentId: 1, status: 1 });
posTerminalSchema.index({ provider: 1, terminalRef: 1 }, { unique: true });
posTerminalSchema.index({ lastSeenAt: -1 });

type PosTerminal = InferSchemaType<typeof posTerminalSchema>;

export const POSTerminalModel =
  (models.POSTerminal as Model<PosTerminal>) || model<PosTerminal>("POSTerminal", posTerminalSchema);
export const PosTerminalModel = POSTerminalModel;

export type { PosTerminal };
