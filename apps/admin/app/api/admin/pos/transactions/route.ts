import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;
    const rawStatus = url.searchParams.get("status");
    const rawLocationId = url.searchParams.get("locationId");

    await connectMongo();
    const filter: Record<string, unknown> = {};
    if (rawStatus) filter.status = rawStatus;
    if (rawLocationId && Types.ObjectId.isValid(rawLocationId)) {
      filter.locationId = new Types.ObjectId(rawLocationId);
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
                startedAt: row.tse.startedAt ?? null,
                finishedAt: row.tse.finishedAt ?? null,
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
