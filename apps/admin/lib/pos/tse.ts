import { Types } from "mongoose";

import { appendPosAuditLog } from "@/lib/pos/audit";
import { FiskalySignDeProvider, type ExistingTseState } from "@/lib/pos/tse/providers/fiskalySignDeProvider";
import { POSTransactionModel } from "@/models/PosTransaction";

export type TSEStartResult = {
  tseTxId: string;
  serial: string;
  startedAt?: Date;
  raw?: unknown;
};

export type TSEFinishResult = {
  signature: string;
  signatureCounter: number;
  logTime: Date;
  finishedAt?: Date;
  raw?: unknown;
};

type TSETransactionContext = {
  txId: string;
  amountCents: number;
  currency: string;
  tseTxId?: string;
  existingTse?: ExistingTseState | null;
};

export type TSEProvider = {
  startTransaction(tx: TSETransactionContext): Promise<TSEStartResult>;
  finishTransaction(tx: TSETransactionContext): Promise<TSEFinishResult>;
  cancelTransaction(tx: TSETransactionContext): Promise<void>;
  ping?: () => Promise<{ ok: boolean; provider: string; env?: string }>;
};

class NoopTSEProvider implements TSEProvider {
  async startTransaction(tx: TSETransactionContext) {
    return {
      tseTxId: `noop-tse-${tx.txId}`,
      serial: "NOOP-SERIAL-001",
      startedAt: new Date(),
      raw: { provider: "noop", state: "ACTIVE" },
    };
  }

  async finishTransaction(tx: TSETransactionContext) {
    const logTime = new Date();
    return {
      signature: `noop-signature-${tx.tseTxId || tx.txId}-${logTime.getTime()}`,
      signatureCounter: Math.max(1, Math.floor(logTime.getTime() / 1000)),
      logTime,
      finishedAt: logTime,
      raw: { provider: "noop", state: "FINISHED", logTime: logTime.toISOString() },
    };
  }

  async cancelTransaction(_tx: TSETransactionContext) {
    void _tx;
  }

  async ping() {
    return { ok: true, provider: "noop", env: process.env.NODE_ENV || "development" };
  }
}

const noopProvider = new NoopTSEProvider();
const fiskalyProvider = new FiskalySignDeProvider();

function shouldStrictTSE() {
  const value = process.env.POS_TSE_STRICT?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function shouldAllowNoopFallback() {
  const value = process.env.POS_TSE_ALLOW_NOOP_FALLBACK?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isSoftFiskalyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fiskaly_not_configured") ||
    normalized.includes("fetch failed") ||
    normalized.includes("fiskaly_auth_failed") ||
    normalized.includes("fiskaly_api_error")
  );
}

function formatTSEError(error: unknown, maxLength = 700) {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown_tse_error");
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function getTSEProvider(providerName?: string | null): { provider: TSEProvider; providerName: string } {
  const envProvider = process.env.POS_TSE_PROVIDER?.trim().toLowerCase();
  const normalized = providerName?.trim().toLowerCase() || envProvider || "noop";

  if (normalized === "fiskaly") {
    return { provider: fiskalyProvider, providerName: "fiskaly" };
  }

  if (!normalized || normalized === "noop") {
    return { provider: noopProvider, providerName: "noop" };
  }

  return { provider: noopProvider, providerName: "noop" };
}

export async function getTSEHealth() {
  const { provider, providerName } = getTSEProvider();
  if (!provider.ping) {
    return { ok: true, provider: providerName };
  }
  const result = await provider.ping();
  return { ok: Boolean(result.ok), provider: result.provider || providerName, env: result.env };
}

type TxRef = {
  _id: string | Types.ObjectId;
  totals?: { grossCents?: number } | null;
  payment?: { providerTxId?: string | null } | null;
  tse?: {
    txId?: string | null;
    provider?: string | null;
    rawPayload?: unknown;
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
  if (row.tse?.startedAt && row.tse?.txId) return;

  const context: TSETransactionContext = {
    txId: txId.toString(),
    amountCents: row.totals?.grossCents || 0,
    currency: "EUR",
    tseTxId: row.tse?.txId ?? undefined,
    existingTse: row.tse
      ? {
          txId: row.tse.txId ?? undefined,
          signature: row.tse.signature ?? undefined,
          serial: row.tse.serial ?? undefined,
          rawPayload: row.tse.rawPayload,
        }
      : null,
  };

  let { provider, providerName } = getTSEProvider(row.tse?.provider);
  let fallbackFrom: string | null = null;
  let fallbackReason: string | null = null;
  let result: TSEStartResult;
  try {
    result = await provider.startTransaction(context);
  } catch (error) {
    if (providerName === "fiskaly" && shouldAllowNoopFallback() && !shouldStrictTSE() && isSoftFiskalyError(error)) {
      fallbackFrom = "fiskaly";
      fallbackReason = error instanceof Error ? error.message : String(error ?? "tse_start_failed");
      provider = noopProvider;
      providerName = "noop";
      result = await provider.startTransaction(context);
    } else {
      throw new Error(`tse_start_failed:${providerName}:${formatTSEError(error)}`);
    }
  }

  const startedAt = result.startedAt || new Date();
  const rawPayload = {
    ...(row.tse?.rawPayload && typeof row.tse.rawPayload === "object" ? (row.tse.rawPayload as Record<string, unknown>) : {}),
    start: result.raw ?? null,
    ...(fallbackFrom ? { fallback: { from: fallbackFrom, reason: fallbackReason, at: startedAt.toISOString() } } : {}),
  };
  await POSTransactionModel.updateOne(
    { _id: txId },
    {
      $set: {
        "tse.provider": providerName,
        "tse.txId": result.tseTxId,
        "tse.serial": result.serial,
        "tse.startedAt": startedAt,
        "tse.rawPayload": rawPayload,
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
      ...(fallbackFrom ? { fallbackFrom, fallbackReason } : {}),
    },
  });
}

export async function tseFinish(tx: TxRef, actorAdminId: string | Types.ObjectId) {
  const { txId, row } = await loadTransaction(tx);
  if (!row) return;
  if (!row.tse?.startedAt) return;
  if (row.tse?.signature) return;

  const context: TSETransactionContext = {
    txId: txId.toString(),
    amountCents: row.totals?.grossCents || 0,
    currency: "EUR",
    tseTxId: row.tse?.txId ?? undefined,
    existingTse: row.tse
      ? {
          txId: row.tse.txId ?? undefined,
          signature: row.tse.signature ?? undefined,
          serial: row.tse.serial ?? undefined,
          rawPayload: row.tse.rawPayload,
        }
      : null,
  };

  let { provider, providerName } = getTSEProvider(row.tse?.provider);
  let fallbackFrom: string | null = null;
  let fallbackReason: string | null = null;
  let result: TSEFinishResult;
  try {
    result = await provider.finishTransaction(context);
  } catch (error) {
    if (providerName === "fiskaly" && shouldAllowNoopFallback() && !shouldStrictTSE() && isSoftFiskalyError(error)) {
      fallbackFrom = "fiskaly";
      fallbackReason = error instanceof Error ? error.message : String(error ?? "tse_finish_failed");
      provider = noopProvider;
      providerName = "noop";
      result = await provider.finishTransaction(context);
    } else {
      throw new Error(`tse_finish_failed:${providerName}:${formatTSEError(error)}`);
    }
  }

  const finishedAt = result.finishedAt || new Date();
  const rawPayload = {
    ...(row.tse?.rawPayload && typeof row.tse.rawPayload === "object" ? (row.tse.rawPayload as Record<string, unknown>) : {}),
    finish: result.raw ?? null,
    ...(fallbackFrom ? { fallback: { from: fallbackFrom, reason: fallbackReason, at: finishedAt.toISOString() } } : {}),
  };
  await POSTransactionModel.updateOne(
    { _id: txId },
    {
      $set: {
        "tse.provider": providerName,
        "tse.signature": result.signature,
        "tse.signatureCounter": result.signatureCounter,
        "tse.logTime": result.logTime,
        "tse.finishedAt": finishedAt,
        "tse.rawPayload": rawPayload,
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
      ...(fallbackFrom ? { fallbackFrom, fallbackReason } : {}),
    },
  });
}

export async function tseCancel(tx: TxRef, actorAdminId: string | Types.ObjectId, reason?: string) {
  const { txId, row } = await loadTransaction(tx);
  if (!row) return;
  if (!row.tse?.startedAt) return;
  if (row.tse?.finishedAt && row.tse?.signature) return;

  const context: TSETransactionContext = {
    txId: txId.toString(),
    amountCents: row.totals?.grossCents || 0,
    currency: "EUR",
    tseTxId: row.tse?.txId ?? undefined,
    existingTse: row.tse
      ? {
          txId: row.tse.txId ?? undefined,
          signature: row.tse.signature ?? undefined,
          serial: row.tse.serial ?? undefined,
          rawPayload: row.tse.rawPayload,
        }
      : null,
  };

  const { provider, providerName: resolvedProviderName } = getTSEProvider(row.tse?.provider);
  let providerName = resolvedProviderName;
  let fallbackFrom: string | null = null;
  let fallbackReason: string | null = null;
  try {
    await provider.cancelTransaction(context);
  } catch (error) {
    if (providerName === "fiskaly" && shouldAllowNoopFallback() && !shouldStrictTSE() && isSoftFiskalyError(error)) {
      fallbackFrom = "fiskaly";
      fallbackReason = error instanceof Error ? error.message : String(error ?? "tse_cancel_failed");
      providerName = "noop";
      await noopProvider.cancelTransaction(context);
    } else {
      throw new Error(`tse_cancel_failed:${providerName}:${formatTSEError(error)}`);
    }
  }

  const finishedAt = new Date();
  const rawPayload = {
    ...(row.tse?.rawPayload && typeof row.tse.rawPayload === "object" ? (row.tse.rawPayload as Record<string, unknown>) : {}),
    cancel: { cancelledAt: finishedAt.toISOString(), reason: reason || "tse_cancel" },
    ...(fallbackFrom ? { fallback: { from: fallbackFrom, reason: fallbackReason, at: finishedAt.toISOString() } } : {}),
  };
  await POSTransactionModel.updateOne(
    { _id: txId, "tse.finishedAt": { $exists: false } },
    {
      $set: {
        "tse.provider": providerName,
        "tse.finishedAt": finishedAt,
        "tse.rawPayload": rawPayload,
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
      ...(fallbackFrom ? { fallbackFrom, fallbackReason } : {}),
    },
  });
}
