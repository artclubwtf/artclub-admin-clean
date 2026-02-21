import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

function parseDateStart(raw?: string | null) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(raw?: string | null) {
  const start = parseDateStart(raw);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function parseAmountToCents(raw?: string | null) {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;
    const rawStatus = url.searchParams.get("status");
    const rawLocationId = url.searchParams.get("locationId");
    const rawFrom = url.searchParams.get("from");
    const rawTo = url.searchParams.get("to");
    const rawMinAmount = url.searchParams.get("minAmount");
    const rawMaxAmount = url.searchParams.get("maxAmount");

    await connectMongo();
    const filter: Record<string, unknown> = {};
    if (rawStatus && rawStatus !== "all") filter.status = rawStatus;
    if (rawLocationId && Types.ObjectId.isValid(rawLocationId)) {
      filter.locationId = new Types.ObjectId(rawLocationId);
    }
    const from = parseDateStart(rawFrom);
    const to = parseDateEnd(rawTo);
    if (from || to) {
      filter.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const minAmountCents = parseAmountToCents(rawMinAmount);
    const maxAmountCents = parseAmountToCents(rawMaxAmount);
    if (minAmountCents !== null || maxAmountCents !== null) {
      filter["totals.grossCents"] = {
        ...(minAmountCents !== null ? { $gte: minAmountCents } : {}),
        ...(maxAmountCents !== null ? { $lte: maxAmountCents } : {}),
      };
    }

    const rows = await POSTransactionModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    return NextResponse.json(
      {
        ok: true,
        transactions: rows.map((row) => ({
          id: row._id.toString(),
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          locationId: row.locationId ? row.locationId.toString() : null,
          terminalId: row.terminalId ? row.terminalId.toString() : null,
          createdByAdminId: row.createdByAdminId ? row.createdByAdminId.toString() : null,
          itemCount: row.items?.length || 0,
          buyer: row.buyer
            ? {
                type: row.buyer.type,
                name: row.buyer.name,
                company: row.buyer.company ?? null,
                email: row.buyer.email ?? null,
              }
            : null,
          payment: row.payment
            ? {
                provider: row.payment.provider,
                providerTxId: row.payment.providerTxId ?? null,
                method: row.payment.method,
                approvedAt: row.payment.approvedAt ?? null,
              }
            : null,
          totals: row.totals,
          tse: row.tse
            ? {
                txId: row.tse.txId ?? null,
                signature: row.tse.signature ?? null,
                signatureCounter: row.tse.signatureCounter ?? null,
                logTime: row.tse.logTime ?? null,
                startedAt: row.tse.startedAt ?? null,
                finishedAt: row.tse.finishedAt ?? null,
              }
            : null,
          receipt: row.receipt
            ? {
                receiptNo: row.receipt.receiptNo ?? null,
                pdfUrl: row.receipt.pdfUrl ?? null,
              }
            : null,
          invoice: row.invoice
            ? {
                invoiceNo: row.invoice.invoiceNo ?? null,
                pdfUrl: row.invoice.pdfUrl ?? null,
              }
            : null,
          contract: row.contract
            ? {
                contractId: row.contract.contractId ? row.contract.contractId.toString() : null,
                pdfUrl: row.contract.pdfUrl ?? null,
              }
            : null,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to load POS transactions", error);
    return NextResponse.json({ ok: false, error: "failed_to_load_transactions" }, { status: 500 });
  }
}
