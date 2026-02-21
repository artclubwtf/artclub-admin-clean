import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { appendPosAuditLog } from "@/lib/pos/audit";
import { ensurePaidArtworkContractDocument } from "@/lib/pos/contracts";
import { ensurePaidTransactionDocuments } from "@/lib/pos/documents";
import { appendWebhookEventId, asRecord, parseIsoDateOrNull, parseWebhookEventIds, reconcilePosPaymentStatus } from "@/lib/pos/paymentStatus";
import { tseCancel, tseFinish } from "@/lib/pos/tse";
import { type TerminalPaymentStatus, mapProviderStatusToTransactionStatus } from "@/lib/pos/terminalPayments";
import { validateVerifoneWebhookSignature } from "@/lib/pos/payments/providers/verifoneProvider";
import { POSTransactionModel } from "@/models/PosTransaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapUnknownVerifoneStatus(statusValue: unknown): TerminalPaymentStatus {
  const raw = String(statusValue || "")
    .trim()
    .toLowerCase();
  if (!raw) return "payment_pending";
  if (raw.includes("refund")) return "refunded";
  if (raw.includes("cancel") || raw.includes("void") || raw.includes("abort")) return "cancelled";
  if (raw.includes("fail") || raw.includes("declin") || raw.includes("reject") || raw.includes("error")) return "failed";
  if (
    raw.includes("paid") ||
    raw.includes("approve") ||
    raw.includes("captur") ||
    raw.includes("complet") ||
    raw.includes("success") ||
    raw.includes("settl")
  ) {
    return "paid";
  }
  return "payment_pending";
}

function extractProviderTxId(payload: Record<string, unknown>) {
  const data = asRecord(payload.data);
  const payment = asRecord(payload.payment);
  const candidates = [
    payload.providerTxId,
    payload.transactionId,
    payload.paymentId,
    payload.id,
    data.providerTxId,
    data.transactionId,
    data.paymentId,
    data.id,
    payment.providerTxId,
    payment.transactionId,
    payment.paymentId,
    payment.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function extractEventId(payload: Record<string, unknown>) {
  const data = asRecord(payload.data);
  const candidates = [payload.eventId, payload.event_id, payload.webhookId, payload.id, data.eventId, data.event_id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function extractStatus(payload: Record<string, unknown>): TerminalPaymentStatus {
  const data = asRecord(payload.data);
  const payment = asRecord(payload.payment);
  const candidates = [
    payload.status,
    payload.paymentStatus,
    payload.transactionStatus,
    payload.state,
    payload.result,
    payload.type,
    data.status,
    data.paymentStatus,
    data.transactionStatus,
    data.state,
    data.result,
    data.type,
    payment.status,
    payment.paymentStatus,
    payment.state,
  ];
  for (const candidate of candidates) {
    const mapped = mapUnknownVerifoneStatus(candidate);
    if (mapped !== "payment_pending") return mapped;
  }
  return "payment_pending";
}

function parseAmountToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return Math.round(parsed * 100);
  }
  const record = asRecord(value);
  if (Object.keys(record).length > 0) {
    if (typeof record.value === "number" && Number.isFinite(record.value)) {
      return Number.isInteger(record.value) ? record.value : Math.round(record.value * 100);
    }
    if (typeof record.amount === "number" && Number.isFinite(record.amount)) {
      return Number.isInteger(record.amount) ? record.amount : Math.round(record.amount * 100);
    }
  }
  return null;
}

function extractAmountCents(payload: Record<string, unknown>) {
  const data = asRecord(payload.data);
  const payment = asRecord(payload.payment);
  const candidates = [payload.amountCents, payload.amount, data.amountCents, data.amount, payment.amountCents, payment.amount];
  for (const candidate of candidates) {
    const parsed = parseAmountToCents(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractOccurredAt(payload: Record<string, unknown>) {
  const data = asRecord(payload.data);
  const payment = asRecord(payload.payment);
  const candidates = [
    payload.occurredAt,
    payload.timestamp,
    payload.createdAt,
    payload.updatedAt,
    data.occurredAt,
    data.timestamp,
    data.createdAt,
    data.updatedAt,
    payment.occurredAt,
    payment.timestamp,
    payment.createdAt,
    payment.updatedAt,
  ];
  for (const candidate of candidates) {
    const parsed = parseIsoDateOrNull(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export async function POST(req: Request) {
  const webhookSecret = process.env.VERIFONE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signatureHeaderName = process.env.VERIFONE_WEBHOOK_SIG_HEADER?.trim().toLowerCase() || "x-verifone-signature";
  const signature = req.headers.get(signatureHeaderName);

  if (!validateVerifoneWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payloadUnknown: unknown;
  try {
    payloadUnknown = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = asRecord(payloadUnknown);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const providerTxId = extractProviderTxId(payload);
  if (!providerTxId) {
    return NextResponse.json({ ok: false, error: "missing_provider_tx_id" }, { status: 400 });
  }

  const eventId = extractEventId(payload);
  const webhookStatus = extractStatus(payload);
  const mappedStatus = mapProviderStatusToTransactionStatus(webhookStatus);
  const amountCents = extractAmountCents(payload);
  const occurredAt = extractOccurredAt(payload);

  try {
    await connectMongo();

    const tx = await POSTransactionModel.findOne({ "payment.providerTxId": providerTxId });
    if (!tx) {
      return NextResponse.json({ ok: true, ignored: "transaction_not_found" }, { status: 200 });
    }

    const beforeStatus = tx.status;
    const nowIso = new Date().toISOString();
    const currentRawPayload = asRecord(tx.payment?.rawStatusPayload);
    const processedIds = parseWebhookEventIds(currentRawPayload.processedWebhookEventIds);

    if (eventId && processedIds.includes(eventId)) {
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: tx.status,
          duplicate: true,
        },
        { status: 200 },
      );
    }

    const nextStatus = reconcilePosPaymentStatus(beforeStatus, mappedStatus);
    const statusChanged = nextStatus !== beforeStatus;
    const nextProcessedIds = eventId ? appendWebhookEventId(processedIds, eventId) : processedIds;

    const updatePayload: Record<string, unknown> = {
      "payment.rawStatusPayload": {
        ...currentRawPayload,
        lastWebhook: payload,
        lastWebhookAt: nowIso,
        lastWebhookEventId: eventId,
        lastWebhookStatus: webhookStatus,
        lastWebhookAmountCents: amountCents,
        lastWebhookOccurredAt: occurredAt,
        processedWebhookEventIds: nextProcessedIds,
      },
    };
    if (statusChanged) {
      updatePayload.status = nextStatus;
    }
    if (nextStatus === "paid" && !tx.payment?.approvedAt) {
      updatePayload["payment.approvedAt"] = new Date();
    }

    const updateQuery = statusChanged ? { _id: tx._id, status: beforeStatus } : { _id: tx._id };
    const updateResult = await POSTransactionModel.updateOne(updateQuery, { $set: updatePayload });
    if (statusChanged && updateResult.modifiedCount === 0) {
      const fresh = await POSTransactionModel.findById(tx._id).select({ status: 1 }).lean();
      return NextResponse.json(
        {
          ok: true,
          txId: tx._id.toString(),
          status: fresh?.status || beforeStatus,
          concurrent: true,
        },
        { status: 200 },
      );
    }

    if (statusChanged && nextStatus === "paid") {
      await tseFinish(tx, tx.createdByAdminId);
      await ensurePaidTransactionDocuments(tx._id, tx.createdByAdminId);
      await ensurePaidArtworkContractDocument(tx._id, tx.createdByAdminId);
    } else if (statusChanged && (nextStatus === "failed" || nextStatus === "cancelled")) {
      await tseCancel(tx, tx.createdByAdminId, `payment_${nextStatus}`);
    }

    if (statusChanged) {
      await appendPosAuditLog({
        actorAdminId: tx.createdByAdminId,
        action: "PAYMENT_STATUS_UPDATE",
        txId: tx._id,
        payload: {
          source: "verifone_webhook",
          provider: tx.payment?.provider || null,
          providerTxId,
          eventId: eventId || null,
          beforeStatus,
          afterStatus: nextStatus,
          amountCents,
          occurredAt,
          receivedAt: nowIso,
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        txId: tx._id.toString(),
        status: statusChanged ? nextStatus : beforeStatus,
        changed: statusChanged,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to process Verifone webhook", error);
    const message = error instanceof Error ? error.message : "webhook_processing_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
