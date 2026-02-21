import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { appendPosAuditLog } from "@/lib/pos/audit";
import { getTerminalPaymentProvider } from "@/lib/pos/terminalPayments";
import { tseFinish } from "@/lib/pos/tse";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

const refundSchema = z.object({
  reason: z.string().trim().min(1, "reason is required"),
  amountCents: z.coerce.number().int().min(1).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !Types.ObjectId.isValid(session.user.id)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  try {
    await connectMongo();

    const tx = await POSTransactionModel.findById(id);
    if (!tx) {
      return NextResponse.json({ ok: false, error: "transaction_not_found" }, { status: 404 });
    }

    if (tx.status === "refunded") {
      return NextResponse.json({ ok: false, error: "already_refunded" }, { status: 409 });
    }
    if (tx.status !== "paid") {
      return NextResponse.json({ ok: false, error: "only_paid_transactions_can_be_refunded" }, { status: 400 });
    }

    const refundAmountCents = parsed.data.amountCents ?? tx.totals.grossCents;
    if (refundAmountCents > tx.totals.grossCents) {
      return NextResponse.json({ ok: false, error: "refund_amount_exceeds_gross" }, { status: 400 });
    }

    if (!tx.payment?.providerTxId) {
      return NextResponse.json({ ok: false, error: "missing_provider_tx_id" }, { status: 400 });
    }

    const provider = getTerminalPaymentProvider(tx.payment.provider);
    await provider.refundPayment(tx.payment.providerTxId, refundAmountCents);

    await tseFinish(tx, session.user.id);

    tx.status = "refunded";
    await tx.save();

    await appendPosAuditLog({
      actorAdminId: session.user.id,
      action: "REFUND",
      txId: tx._id,
      payload: {
        reason: parsed.data.reason,
        refundAmountCents,
        previousStatus: "paid",
        provider: tx.payment.provider,
        providerTxId: tx.payment.providerTxId,
      },
    });

    return NextResponse.json({ ok: true, txId: tx._id.toString(), status: tx.status }, { status: 200 });
  } catch (error) {
    console.error("Failed to refund POS transaction", error);
    const message = error instanceof Error ? error.message : "refund_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
