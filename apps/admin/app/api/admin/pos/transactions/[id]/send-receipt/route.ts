import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

const bodySchema = z
  .object({
    email: z.string().trim().email().optional(),
  })
  .nullable()
  .optional();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse((await req.json().catch(() => null)) as unknown);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const body = parsed.data;

  await connectMongo();
  const tx = await POSTransactionModel.findById(id);
  if (!tx) {
    return NextResponse.json({ ok: false, error: "transaction_not_found" }, { status: 404 });
  }
  if (tx.status !== "paid") {
    return NextResponse.json({ ok: false, error: "transaction_not_paid" }, { status: 409 });
  }
  if (!tx.receipt?.pdfUrl) {
    return NextResponse.json({ ok: false, error: "receipt_not_generated" }, { status: 409 });
  }

  const email = body?.email?.trim() || tx.receipt?.requestEmail?.trim() || tx.buyer?.email?.trim();
  if (!email) {
    return NextResponse.json({ ok: false, error: "receipt_email_missing" }, { status: 400 });
  }

  const now = new Date();
  tx.receipt = {
    ...(tx.receipt || {}),
    requestEmail: email,
    emailQueuedAt: now,
  };
  await tx.save();

  return NextResponse.json({
    ok: true,
    mode: "queued",
    email,
    queuedAt: now.toISOString(),
    receiptPdfUrl: tx.receipt.pdfUrl,
  });
}
