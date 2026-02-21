import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { tseFinish } from "@/lib/pos/tse";
import { getTerminalPaymentProvider, mapProviderStatusToTransactionStatus } from "@/lib/pos/terminalPayments";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

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

    if (!tx.payment?.providerTxId) {
      return NextResponse.json({ ok: false, error: "missing_provider_tx_id" }, { status: 400 });
    }

    const provider = getTerminalPaymentProvider(tx.payment.provider);
    const providerResult = await provider.getPaymentStatus(tx.payment.providerTxId);
    const providerStatus = providerResult.status;
    let nextStatus: typeof tx.status = mapProviderStatusToTransactionStatus(providerStatus);
    if (nextStatus === "payment_pending" && tx.status !== "created" && tx.status !== "payment_pending") {
      nextStatus = tx.status;
    }

    const updatePayload: Record<string, unknown> = {};
    if (nextStatus !== tx.status) {
      updatePayload.status = nextStatus;
    }
    if (nextStatus === "paid" && !tx.payment.approvedAt) {
      updatePayload["payment.approvedAt"] = new Date();
    }

    if (Object.keys(updatePayload).length > 0) {
      await POSTransactionModel.updateOne({ _id: tx._id }, { $set: updatePayload });
    }

    if (nextStatus === "paid") {
      await tseFinish(tx, session.user.id);
    }

    return NextResponse.json(
      {
        ok: true,
        txId: tx._id.toString(),
        status: nextStatus,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to load POS checkout status", error);
    const message = error instanceof Error ? error.message : "checkout_status_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
