import { createHash } from "crypto";
import { Types } from "mongoose";

import { CounterModel } from "@/models/Counter";
import { POSAuditLogModel, posAuditActions } from "@/models/PosAuditLog";

const AUDIT_HASH_SCOPE = "audit_hash";
const AUDIT_HASH_YEAR = 2000;

type PosAuditAction = (typeof posAuditActions)[number];

type AppendPosAuditLogInput = {
  actorAdminId: string | Types.ObjectId;
  action: PosAuditAction;
  txId?: string | Types.ObjectId;
  payload?: unknown;
};

function toObjectId(value: string | Types.ObjectId) {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

function computeHash(prevHash: string, payloadJson: string, timestampIso: string) {
  return createHash("sha256").update(`${prevHash}${payloadJson}${timestampIso}`, "utf8").digest("hex");
}

export async function appendPosAuditLog(input: AppendPosAuditLogInput) {
  const actorAdminId = toObjectId(input.actorAdminId);
  const txId = input.txId ? toObjectId(input.txId) : undefined;
  const payload = input.payload ?? {};
  const payloadJson = JSON.stringify(payload);

  await CounterModel.findOneAndUpdate(
    { scope: AUDIT_HASH_SCOPE, year: AUDIT_HASH_YEAR },
    { $setOnInsert: { value: 0, lastHash: "" } },
    { upsert: true, new: true },
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const counter = await CounterModel.findOne({ scope: AUDIT_HASH_SCOPE, year: AUDIT_HASH_YEAR }).lean();
    const prevHash = typeof counter?.lastHash === "string" ? counter.lastHash : "";
    const createdAt = new Date();
    const hash = computeHash(prevHash, payloadJson, createdAt.toISOString());

    const counterUpdate = await CounterModel.updateOne(
      { scope: AUDIT_HASH_SCOPE, year: AUDIT_HASH_YEAR, lastHash: prevHash },
      {
        $set: { lastHash: hash },
        $inc: { value: 1 },
      },
    );

    if (counterUpdate.modifiedCount === 0) {
      continue;
    }

    return POSAuditLogModel.create({
      actorAdminId,
      action: input.action,
      txId,
      payload,
      prevHash,
      hash,
      createdAt,
    });
  }

  throw new Error("failed_to_append_pos_audit_log");
}
