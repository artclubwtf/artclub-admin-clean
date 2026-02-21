import { Types } from "mongoose";

import { appendPosAuditLog } from "@/lib/pos/audit";
import { POSTransactionModel } from "@/models/PosTransaction";

export type TSEStartResult = {
  tseTxId: string;
  serial: string;
};

export type TSEFinishResult = {
  signature: string;
  signatureCounter: number;
  logTime: Date;
};

type TSETransactionContext = {
  txId: string;
  amountCents: number;
  currency: string;
  tseTxId?: string;
};

export type TSEProvider = {
  startTransaction(tx: TSETransactionContext): Promise<TSEStartResult>;
  finishTransaction(tx: TSETransactionContext): Promise<TSEFinishResult>;
  cancelTransaction(tx: TSETransactionContext): Promise<void>;
};

class NoopTSEProvider implements TSEProvider {
  async startTransaction(tx: TSETransactionContext) {
    return {
      tseTxId: `noop-tse-${tx.txId}`,
      serial: "NOOP-SERIAL-001",
    };
  }

  async finishTransaction(tx: TSETransactionContext) {
    const logTime = new Date();
    return {
      signature: `noop-signature-${tx.tseTxId || tx.txId}-${logTime.getTime()}`,
      signatureCounter: Math.max(1, Math.floor(logTime.getTime() / 1000)),
      logTime,
    };
  }

  async cancelTransaction(_tx: TSETransactionContext) {
    void _tx;
  }
}

const noopProvider = new NoopTSEProvider();

function getTSEProvider(providerName?: string | null): { provider: TSEProvider; providerName: string } {
  const normalized = providerName?.trim().toLowerCase();
  if (!normalized || normalized === "noop") {
    return { provider: noopProvider, providerName: "noop" };
  }
  if (process.env.NODE_ENV !== "production") {
    return { provider: noopProvider, providerName: "noop" };
  }

  // Placeholder until real TSE adapters are connected.
  return { provider: noopProvider, providerName: "noop" };
}

type TxRef = {
  _id: string | Types.ObjectId;
  totals?: { grossCents?: number } | null;
  payment?: { providerTxId?: string | null } | null;
  tse?: {
    txId?: string | null;
    provider?: string | null;
    signature?: string | null;
    signatureCounter?: number | null;
    serial?: string | null;
    logTime?: Date | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  } | null;
};

function toObjectId(value: string | Types.ObjectId) {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

async function loadTransaction(tx: TxRef) {
  const txId = toObjectId(tx._id);
  const row =
    tx.tse && tx.totals
      ? tx
      : await POSTransactionModel.findById(txId)
          .select({ _id: 1, totals: 1, payment: 1, tse: 1 })
          .lean();
  return { txId, row };
}

export async function tseStart(tx: TxRef, actorAdminId: string | Types.ObjectId) {
  const { txId, row } = await loadTransaction(tx);
  if (!row) return;
  if (row.tse?.startedAt) return;

  const { provider, providerName } = getTSEProvider(row.tse?.provider);
  const result = await provider.startTransaction({
    txId: txId.toString(),
    amountCents: row.totals?.grossCents || 0,
    currency: "EUR",
  });

  const startedAt = new Date();
  await POSTransactionModel.updateOne(
    { _id: txId, "tse.startedAt": { $exists: false } },
    {
      $set: {
        "tse.provider": providerName,
        "tse.txId": result.tseTxId,
        "tse.serial": result.serial,
        "tse.startedAt": startedAt,
      },
    },
  );

  await appendPosAuditLog({
    actorAdminId,
    action: "TSE_START",
    txId,
    payload: {
      provider: providerName,
      tseTxId: result.tseTxId,
      serial: result.serial,
      startedAt,
    },
  });
}

export async function tseFinish(tx: TxRef, actorAdminId: string | Types.ObjectId) {
  const { txId, row } = await loadTransaction(tx);
  if (!row) return;
  if (!row.tse?.startedAt) return;
  if (row.tse?.finishedAt && row.tse?.signature) return;

  const { provider, providerName } = getTSEProvider(row.tse?.provider);
  const result = await provider.finishTransaction({
    txId: txId.toString(),
    amountCents: row.totals?.grossCents || 0,
    currency: "EUR",
    tseTxId: row.tse?.txId ?? undefined,
  });

  const finishedAt = new Date();
  await POSTransactionModel.updateOne(
    { _id: txId },
    {
      $set: {
        "tse.provider": providerName,
        "tse.signature": result.signature,
        "tse.signatureCounter": result.signatureCounter,
        "tse.logTime": result.logTime,
        "tse.finishedAt": finishedAt,
      },
    },
  );

  await appendPosAuditLog({
    actorAdminId,
    action: "TSE_FINISH",
    txId,
    payload: {
      provider: providerName,
      signature: result.signature,
      signatureCounter: result.signatureCounter,
      logTime: result.logTime,
      finishedAt,
    },
  });
}

export async function tseCancel(tx: TxRef, actorAdminId: string | Types.ObjectId, reason?: string) {
  const { txId, row } = await loadTransaction(tx);
  if (!row) return;
  if (!row.tse?.startedAt) return;
  if (row.tse?.finishedAt && row.tse?.signature) return;

  const { provider, providerName } = getTSEProvider(row.tse?.provider);
  await provider.cancelTransaction({
    txId: txId.toString(),
    amountCents: row.totals?.grossCents || 0,
    currency: "EUR",
    tseTxId: row.tse?.txId ?? undefined,
  });

  const finishedAt = new Date();
  await POSTransactionModel.updateOne(
    { _id: txId, "tse.finishedAt": { $exists: false } },
    {
      $set: {
        "tse.provider": providerName,
        "tse.finishedAt": finishedAt,
      },
    },
  );

  await appendPosAuditLog({
    actorAdminId,
    action: "CANCEL",
    txId,
    payload: {
      reason: reason || "tse_cancel",
      provider: providerName,
      finishedAt,
    },
  });
}
