import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { appendPosAuditLog } from "@/lib/pos/audit";
import { ensurePaidArtworkContractDocument } from "@/lib/pos/contracts";
import { ensurePaidTransactionDocuments } from "@/lib/pos/documents";
import { asRecord, isPendingPosStatus, reconcilePosPaymentStatus } from "@/lib/pos/paymentStatus";
import { tseCancel, tseFinish } from "@/lib/pos/tse";
import { getTerminalPaymentProvider, mapProviderStatusToTransactionStatus } from "@/lib/pos/terminalPayments";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

const PROVIDER_POLL_MIN_INTERVAL_MS = 2_000;

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !Types.ObjectId.isValid(session.user.id)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const txId = url.searchParams.get("txId");
  if (!txId) {
    return NextResponse.json({ ok: false, error: "txId is required" }, { status: 400 });
  }
  if (!Types.ObjectId.isValid(txId)) {
    return NextResponse.json({ ok: false, error: "invalid_txId" }, { status: 400 });
  }

  try {
    await connectMongo();

    const tx = await POSTransactionModel.findById(txId);
    if (!tx) {
      return NextResponse.json({ ok: false, error: "tx_not_found" }, { status: 404 });
    }

    if (tx.payment.provider === "bridge" || tx.payment.provider === "external") {
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: tx.status,
          polledProvider: false,
          provider: tx.payment.provider,
          updatedAt: tx.updatedAt,
        },
        { status: 200 },
      );
    }
    if (!tx.payment?.providerTxId) {
      return NextResponse.json({ ok: false, error: "missing_provider_tx_id" }, { status: 400 });
    }

    const currentRawPayload = asRecord(tx.payment?.rawStatusPayload);
    const webhookSeenAt =
      typeof currentRawPayload.lastWebhookAt === "string" && currentRawPayload.lastWebhookAt.trim().length > 0
        ? currentRawPayload.lastWebhookAt
        : null;
    const lastWebhookStatus =
      typeof currentRawPayload.lastWebhookStatus === "string" ? currentRawPayload.lastWebhookStatus : null;

    if (!isPendingPosStatus(tx.status)) {
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: tx.status,
          polledProvider: false,
        },
        { status: 200 },
      );
    }

    if (tx.status === "payment_pending" && webhookSeenAt && lastWebhookStatus && lastWebhookStatus !== "payment_pending") {
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: tx.status,
          polledProvider: false,
          webhookSeenAt,
          lastWebhookStatus,
        },
        { status: 200 },
      );
    }

    const lastProviderPollAtMs = tx.lastProviderPollAt instanceof Date ? tx.lastProviderPollAt.getTime() : null;
    const nowMs = Date.now();
    if (lastProviderPollAtMs && nowMs - lastProviderPollAtMs < PROVIDER_POLL_MIN_INTERVAL_MS) {
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: tx.status,
          polledProvider: false,
          rateLimited: true,
          nextPollInMs: PROVIDER_POLL_MIN_INTERVAL_MS - (nowMs - lastProviderPollAtMs),
        },
        { status: 200 },
      );
    }

    const provider = getTerminalPaymentProvider(tx.payment.provider);
    const providerResult = await provider.getPaymentStatus(tx.payment.providerTxId);
    const providerStatus = providerResult.status;
    const mappedStatus = mapProviderStatusToTransactionStatus(providerStatus);
    const nextStatus = reconcilePosPaymentStatus(tx.status, mappedStatus);
    const statusChanged = nextStatus !== tx.status;
    const nowIso = new Date(nowMs).toISOString();

    const updatePayload: Record<string, unknown> = {
      lastProviderPollAt: new Date(nowMs),
    };
    updatePayload["payment.rawStatusPayload"] = {
      ...currentRawPayload,
      lastStatusPoll: providerResult.raw ?? null,
      lastStatusPolledAt: nowIso,
    };
    if (statusChanged) {
      updatePayload.status = nextStatus;
    }
    if (nextStatus === "paid" && !tx.payment.approvedAt) {
      updatePayload["payment.approvedAt"] = new Date();
    }

    const updateQuery = statusChanged ? { _id: tx._id, status: tx.status } : { _id: tx._id };
    const updateResult = await POSTransactionModel.updateOne(updateQuery, { $set: updatePayload });
    if (statusChanged && updateResult.modifiedCount === 0) {
      const fresh = await POSTransactionModel.findById(tx._id).select({ status: 1 }).lean();
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: fresh?.status || tx.status,
          polledProvider: true,
        },
        { status: 200 },
      );
    }

    if (statusChanged && nextStatus === "paid") {
      await tseFinish(tx, session.user.id);
      await ensurePaidTransactionDocuments(tx._id, session.user.id);
      await ensurePaidArtworkContractDocument(tx._id, session.user.id);
    } else if (statusChanged && (nextStatus === "failed" || nextStatus === "cancelled")) {
      await tseCancel(tx, session.user.id, `payment_${nextStatus}`);
    }

    if (statusChanged) {
      await appendPosAuditLog({
        actorAdminId: session.user.id,
        action: "PAYMENT_STATUS_UPDATE",
        txId: tx._id,
        payload: {
          source: "polling_fallback",
          provider: tx.payment.provider,
          providerTxId: tx.payment.providerTxId,
          beforeStatus: tx.status,
          afterStatus: nextStatus,
          occurredAt: nowIso,
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        txId: tx._id.toString(),
        status: nextStatus,
        polledProvider: true,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to load POS checkout status", error);
    const message = error instanceof Error ? error.message : "checkout_status_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
