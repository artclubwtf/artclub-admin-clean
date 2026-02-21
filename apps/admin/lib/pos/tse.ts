import { Types } from "mongoose";

import { POSAuditLogModel } from "@/models/PosAuditLog";
import { POSTransactionModel } from "@/models/PosTransaction";

const TSE_PLACEHOLDER_PROVIDER = "placeholder";

type TxRef = {
  _id: string | Types.ObjectId;
};

function toObjectId(value: string | Types.ObjectId) {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

export async function tseStart(tx: TxRef, actorAdminId: string | Types.ObjectId) {
  const txId = toObjectId(tx._id);
  const adminId = toObjectId(actorAdminId);
  const startedAt = new Date();

  const updated = await POSTransactionModel.updateOne(
    { _id: txId, "tse.startedAt": { $exists: false } },
    {
      $set: {
        "tse.provider": TSE_PLACEHOLDER_PROVIDER,
        "tse.txId": `tse_${txId.toString()}`,
        "tse.startedAt": startedAt,
      },
    },
  );

  if (updated.modifiedCount > 0) {
    await POSAuditLogModel.create({
      actorAdminId: adminId,
      action: "TSE_START",
      txId,
      payload: {
        provider: TSE_PLACEHOLDER_PROVIDER,
        startedAt,
      },
    });
  }
}

export async function tseFinish(tx: TxRef, actorAdminId: string | Types.ObjectId) {
  const txId = toObjectId(tx._id);
  const adminId = toObjectId(actorAdminId);
  const finishedAt = new Date();

  const updated = await POSTransactionModel.updateOne(
    { _id: txId, "tse.finishedAt": { $exists: false } },
    {
      $set: {
        "tse.finishedAt": finishedAt,
      },
    },
  );

  if (updated.modifiedCount > 0) {
    await POSAuditLogModel.create({
      actorAdminId: adminId,
      action: "TSE_FINISH",
      txId,
      payload: {
        finishedAt,
      },
    });
  }
}
