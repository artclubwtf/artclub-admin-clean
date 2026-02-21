import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { appendPosAuditLog } from "@/lib/pos/audit";
import { getTerminalPaymentProvider } from "@/lib/pos/terminalPayments";
import { tseCancel, tseFinish } from "@/lib/pos/tse";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

const stornoSchema = z.object({
  reason: z.string().trim().min(1, "reason is required"),
});

const blockedStatuses = new Set(["refunded", "storno"]);

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
  const parsed = stornoSchema.safeParse(body);
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

    if (blockedStatuses.has(tx.status)) {
      return NextResponse.json({ ok: false, error: `status_not_reversible:${tx.status}` }, { status: 409 });
    }

    const previousStatus = tx.status;

    if (tx.payment?.providerTxId) {
      const provider = getTerminalPaymentProvider(tx.payment.provider);
      await provider.cancelPayment(tx.payment.providerTxId);
    }

    if (previousStatus === "paid") {
      await tseFinish(tx, session.user.id);
    } else {
      await tseCancel(tx, session.user.id, "storno");
    }

    tx.status = "storno";
    await tx.save();

    await appendPosAuditLog({
      actorAdminId: session.user.id,
      action: "STORNO",
      txId: tx._id,
      payload: {
        reason: parsed.data.reason,
        previousStatus,
        provider: tx.payment?.provider ?? null,
        providerTxId: tx.payment?.providerTxId ?? null,
      },
    });

    return NextResponse.json({ ok: true, txId: tx._id.toString(), status: tx.status }, { status: 200 });
  } catch (error) {
    console.error("Failed to storno POS transaction", error);
    const message = error instanceof Error ? error.message : "storno_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
