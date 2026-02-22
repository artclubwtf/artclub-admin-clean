import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosAuditLogModel } from "@/models/PosAuditLog";
import { POSTransactionModel } from "@/models/PosTransaction";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  try {
    await connectMongo();
    const tx = await POSTransactionModel.findById(id).lean();
    if (!tx) {
      return NextResponse.json({ ok: false, error: "transaction_not_found" }, { status: 404 });
    }

    const audit = await PosAuditLogModel.find({ txId: tx._id }).sort({ createdAt: 1, _id: 1 }).lean();

    return NextResponse.json(
      {
        ok: true,
        transaction: {
          id: tx._id.toString(),
          status: tx.status,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt,
          locationId: tx.locationId ? tx.locationId.toString() : null,
          terminalId: tx.terminalId ? tx.terminalId.toString() : null,
          createdByAdminId: tx.createdByAdminId ? tx.createdByAdminId.toString() : null,
          items: (tx.items || []).map((line, idx) => ({
            lineNo: idx + 1,
            itemId: line.itemId ? line.itemId.toString() : null,
            titleSnapshot: line.titleSnapshot,
            qty: line.qty,
            unitGrossCents: line.unitGrossCents,
            vatRate: line.vatRate,
            lineGrossCents: line.qty * line.unitGrossCents,
          })),
          totals: tx.totals,
          buyer: tx.buyer
            ? {
                type: tx.buyer.type,
                name: tx.buyer.name,
                company: tx.buyer.company ?? null,
                email: tx.buyer.email ?? null,
                phone: tx.buyer.phone ?? null,
                billingAddress: tx.buyer.billingAddress ?? null,
                shippingAddress: tx.buyer.shippingAddress ?? null,
              }
            : null,
          payment: tx.payment
            ? {
                provider: tx.payment.provider,
                providerTxId: tx.payment.providerTxId ?? null,
                method: tx.payment.method,
                externalRef: tx.payment.externalRef
                  ? {
                      terminalSlipNo: tx.payment.externalRef.terminalSlipNo ?? null,
                      rrn: tx.payment.externalRef.rrn ?? null,
                      note: tx.payment.externalRef.note ?? null,
                    }
                  : null,
                tipCents: tx.payment.tipCents ?? null,
                approvedAt: tx.payment.approvedAt ?? null,
              }
            : null,
          receipt: tx.receipt
            ? {
                receiptNo: tx.receipt.receiptNo ?? null,
                pdfUrl: tx.receipt.pdfUrl ?? null,
                requestEmail: tx.receipt.requestEmail ?? null,
                emailQueuedAt: tx.receipt.emailQueuedAt ?? null,
              }
            : null,
          invoice: tx.invoice
            ? {
                invoiceNo: tx.invoice.invoiceNo ?? null,
                pdfUrl: tx.invoice.pdfUrl ?? null,
              }
            : null,
          contract: tx.contract
            ? {
                contractId: tx.contract.contractId ? tx.contract.contractId.toString() : null,
                pdfUrl: tx.contract.pdfUrl ?? null,
              }
            : null,
          tse: tx.tse
            ? {
                provider: tx.tse.provider ?? null,
                txId: tx.tse.txId ?? null,
                serial: tx.tse.serial ?? null,
                signature: tx.tse.signature ?? null,
                signatureCounter: tx.tse.signatureCounter ?? null,
                logTime: tx.tse.logTime ?? null,
                startedAt: tx.tse.startedAt ?? null,
                finishedAt: tx.tse.finishedAt ?? null,
              }
            : null,
        },
        audit: audit.map((entry) => ({
          id: entry._id.toString(),
          createdAt: entry.createdAt,
          actorAdminId: entry.actorAdminId ? entry.actorAdminId.toString() : null,
          action: entry.action,
          prevHash: entry.prevHash ?? "",
          hash: entry.hash ?? "",
          payload: entry.payload ?? {},
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to load POS transaction detail", error);
    return NextResponse.json({ ok: false, error: "failed_to_load_transaction_detail" }, { status: 500 });
  }
}
