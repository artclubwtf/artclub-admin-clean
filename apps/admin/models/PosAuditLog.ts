import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

export const posAuditActions = [
  "CREATE_TX",
  "PAYMENT_STATUS_UPDATE",
  "PAYMENT_MARK_PAID",
  "UPDATE_PRICE",
  "CANCEL",
  "REFUND",
  "STORNO",
  "ISSUE_RECEIPT",
  "ISSUE_INVOICE",
  "SIGN_CONTRACT",
  "TSE_START",
  "TSE_FINISH",
] as const;

const posAuditLogSchema = new Schema(
  {
    actorAdminId: { type: Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: posAuditActions, required: true },
    txId: { type: Types.ObjectId, ref: "POSTransaction" },
    prevHash: { type: String, required: true, trim: true, default: "" },
    hash: { type: String, required: true, trim: true },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "pos_audit_logs" },
);

const appendOnlyError = () => {
  throw new Error("POSAuditLog is append-only");
};

posAuditLogSchema.pre("updateOne", appendOnlyError);
posAuditLogSchema.pre("updateMany", appendOnlyError);
posAuditLogSchema.pre("findOneAndUpdate", appendOnlyError);
posAuditLogSchema.pre("deleteOne", appendOnlyError);
posAuditLogSchema.pre("deleteMany", appendOnlyError);
posAuditLogSchema.pre("findOneAndDelete", appendOnlyError);

posAuditLogSchema.index({ createdAt: -1 });
posAuditLogSchema.index({ txId: 1, createdAt: -1 });
posAuditLogSchema.index({ actorAdminId: 1, createdAt: -1 });
posAuditLogSchema.index({ action: 1, createdAt: -1 });
posAuditLogSchema.index({ hash: 1 }, { unique: true, sparse: true });

type PosAuditLog = InferSchemaType<typeof posAuditLogSchema>;

export const POSAuditLogModel =
  (models.POSAuditLog as Model<PosAuditLog>) || model<PosAuditLog>("POSAuditLog", posAuditLogSchema);
export const PosAuditLogModel = POSAuditLogModel;

export type { PosAuditLog };
