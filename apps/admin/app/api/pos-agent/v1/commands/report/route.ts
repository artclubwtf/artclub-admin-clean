import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { appendPosAuditLog } from "@/lib/pos/audit";
import { ensurePaidArtworkContractDocument } from "@/lib/pos/contracts";
import { ensurePaidTransactionDocuments } from "@/lib/pos/documents";
import { requirePosAgent } from "@/lib/pos/agentAuth";
import { asRecord, reconcilePosPaymentStatus } from "@/lib/pos/paymentStatus";
import { tseCancel, tseFinish } from "@/lib/pos/tse";
import { POSTransactionModel } from "@/models/PosTransaction";
import { PosCommandModel } from "@/models/PosCommand";

const reportSchema = z.object({
  commandId: z.string().trim().min(1, "commandId is required"),
  ok: z.boolean(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().trim().optional(),
});

function mapBridgeStatus(statusValue: unknown, ok: boolean) {
  if (!ok) return "failed" as const;
  const normalized = String(statusValue || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "paid" as const;
  if (["paid", "success", "approved", "completed"].includes(normalized)) return "paid" as const;
  if (["cancelled", "canceled", "aborted", "voided"].includes(normalized)) return "cancelled" as const;
  if (["failed", "declined", "error", "rejected"].includes(normalized)) return "failed" as const;
  if (["refunded", "refund"].includes(normalized)) return "refunded" as const;
  if (["payment_pending", "pending"].includes(normalized)) return "payment_pending" as const;
  return "paid" as const;
}

export async function POST(req: Request) {
  const { error, agent } = await requirePosAgent(req);
  if (error || !agent) return error;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  const { commandId, ok, result, error: reportError } = parsed.data;
  if (!Types.ObjectId.isValid(commandId)) {
    return NextResponse.json({ ok: false, error: "invalid_commandId" }, { status: 400 });
  }

  try {
    const command = await PosCommandModel.findOne({ _id: commandId, agentId: agent._id });
    if (!command) {
      return NextResponse.json({ ok: false, error: "command_not_found" }, { status: 404 });
    }

    if (command.status === "done" || command.status === "failed") {
      return NextResponse.json({ ok: true, commandId, status: command.status, idempotent: true }, { status: 200 });
    }

    if (command.type === "zvt_payment") {
      const payloadRecord = asRecord(command.payload);
      const txIdRaw = payloadRecord.txId;
      if (typeof txIdRaw === "string" && Types.ObjectId.isValid(txIdRaw)) {
        const tx = await POSTransactionModel.findById(txIdRaw);
        if (tx) {
          const currentRawPayload = asRecord(tx.payment?.rawStatusPayload);
          const beforeStatus = tx.status;
          const reportedStatus = mapBridgeStatus(result?.status, ok);
          const nextStatus = reconcilePosPaymentStatus(beforeStatus, reportedStatus);
          const statusChanged = nextStatus !== beforeStatus;
          const nowIso = new Date().toISOString();

          const updatePayload: Record<string, unknown> = {
            "payment.rawStatusPayload": {
              ...currentRawPayload,
              lastBridgeAgentReport: result ?? null,
              lastBridgeAgentError: reportError || null,
              lastBridgeAgentReportAt: nowIso,
              lastBridgeAgentOk: ok,
              bridgeCommandId: command._id.toString(),
              bridgeAgentId: agent._id.toString(),
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
          const appliedStatusChange = !statusChanged || updateResult.modifiedCount > 0;

          if (appliedStatusChange && statusChanged) {
            if (nextStatus === "paid") {
              await tseFinish(tx, tx.createdByAdminId);
              await ensurePaidTransactionDocuments(tx._id, tx.createdByAdminId);
              await ensurePaidArtworkContractDocument(tx._id, tx.createdByAdminId);
            } else if (nextStatus === "failed" || nextStatus === "cancelled") {
              await tseCancel(tx, tx.createdByAdminId, `bridge_agent_${nextStatus}`);
            }

            await appendPosAuditLog({
              actorAdminId: tx.createdByAdminId,
              action: "PAYMENT_STATUS_UPDATE",
              txId: tx._id,
              payload: {
                source: "bridge_agent",
                commandId: command._id.toString(),
                agentId: agent._id.toString(),
                beforeStatus,
                afterStatus: nextStatus,
                ok,
                result: result ?? null,
                error: reportError || null,
                occurredAt: nowIso,
              },
            });
          }
        }
      }
    }

    const payloadRecord = asRecord(command.payload);
    const nextCommandStatus = ok ? "done" : "failed";
    await PosCommandModel.updateOne(
      { _id: command._id, agentId: agent._id, status: { $in: ["queued", "sent"] } },
      {
        $set: {
          status: nextCommandStatus,
          payload: {
            ...payloadRecord,
            report: {
              ok,
              result: result ?? null,
              error: reportError || null,
              reportedAt: new Date().toISOString(),
            },
          },
        },
      },
    );

    return NextResponse.json({ ok: true, commandId, status: nextCommandStatus }, { status: 200 });
  } catch (routeError) {
    console.error("Failed to process POS agent command report", routeError);
    const message = routeError instanceof Error ? routeError.message : "command_report_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
