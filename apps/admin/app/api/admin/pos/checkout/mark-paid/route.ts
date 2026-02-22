import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { appendPosAuditLog } from "@/lib/pos/audit";
import { ensurePaidArtworkContractDocument } from "@/lib/pos/contracts";
import { ensurePaidTransactionDocuments } from "@/lib/pos/documents";
import { tseFinish } from "@/lib/pos/tse";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

const markPaidSchema = z.object({
  txId: z.string().trim().min(1, "txId is required"),
  method: z.enum(["external", "cash"]).optional(),
  slipNo: z.string().trim().optional(),
  rrn: z.string().trim().optional(),
  note: z.string().trim().optional(),
  externalRef: z
    .object({
      terminalSlipNo: z.string().trim().optional(),
      rrn: z.string().trim().optional(),
      note: z.string().trim().optional(),
    })
    .optional(),
});

function toOptionalTrimmed(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function buildTxResponse(txId: Types.ObjectId) {
  const tx = await POSTransactionModel.findById(txId).lean();
  if (!tx) return null;
  return {
    txId: tx._id.toString(),
    status: tx.status,
    receipt: {
      receiptNo: tx.receipt?.receiptNo ?? null,
      pdfUrl: tx.receipt?.pdfUrl ?? null,
      requestEmail: tx.receipt?.requestEmail ?? null,
    },
    invoice: {
      invoiceNo: tx.invoice?.invoiceNo ?? null,
      pdfUrl: tx.invoice?.pdfUrl ?? null,
    },
    contract: {
      contractId: tx.contract?.contractId ? tx.contract.contractId.toString() : null,
      pdfUrl: tx.contract?.pdfUrl ?? null,
    },
  };
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !Types.ObjectId.isValid(session.user.id)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = markPaidSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  const { txId, externalRef } = parsed.data;
  if (!Types.ObjectId.isValid(txId)) {
    return NextResponse.json({ ok: false, error: "invalid_txId" }, { status: 400 });
  }

  const markMethod = parsed.data.method || "external";
  const slipNo = toOptionalTrimmed(parsed.data.slipNo) ?? toOptionalTrimmed(externalRef?.terminalSlipNo);
  const rrn = toOptionalTrimmed(parsed.data.rrn) ?? toOptionalTrimmed(externalRef?.rrn);
  const note = toOptionalTrimmed(parsed.data.note) ?? toOptionalTrimmed(externalRef?.note);

  try {
    await connectMongo();

    const tx = await POSTransactionModel.findById(txId);
    if (!tx) {
      return NextResponse.json({ ok: false, error: "tx_not_found" }, { status: 404 });
    }

    if (["paid", "refunded", "storno"].includes(tx.status)) {
      const txPayload = await buildTxResponse(tx._id);
      return NextResponse.json(
        {
          ok: true,
          ...(txPayload || { txId: tx._id.toString(), status: tx.status }),
          idempotent: true,
        },
        { status: 200 },
      );
    }
    if (!["created", "payment_pending"].includes(tx.status)) {
      return NextResponse.json({ ok: false, error: `status_not_markable:${tx.status}` }, { status: 409 });
    }

    const beforeStatus = tx.status;
    const now = new Date();
    tx.status = "paid";
    tx.payment.provider = "external";
    tx.payment.providerTxId = `${markMethod}:${tx._id.toString()}`;
    tx.payment.method = markMethod === "cash" ? "cash" : "terminal_external";
    tx.payment.approvedAt = now;
    tx.payment.externalRef = {
      terminalSlipNo: slipNo,
      rrn,
      note,
    };
    tx.payment.externalMeta = {
      slipNo,
      rrn,
      note,
      method: markMethod,
    };
    await tx.save();

    await appendPosAuditLog({
      actorAdminId: session.user.id,
      action: "PAYMENT_MARK_PAID",
      txId: tx._id,
      payload: {
        source: markMethod === "cash" ? "manual_cash" : "manual_external",
        method: markMethod,
        beforeStatus,
        afterStatus: "paid",
        slipNo: slipNo ?? null,
        rrn: rrn ?? null,
        note: note ?? null,
      },
    });

    await tseFinish(tx, session.user.id);
    await ensurePaidTransactionDocuments(tx._id, session.user.id);
    await ensurePaidArtworkContractDocument(tx._id, session.user.id);

    const txPayload = await buildTxResponse(tx._id);
    return NextResponse.json(
      {
        ok: true,
        ...(txPayload || { txId: tx._id.toString(), status: tx.status }),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to mark POS transaction paid", error);
    const message = error instanceof Error ? error.message : "mark_paid_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
