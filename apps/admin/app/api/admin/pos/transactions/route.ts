import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosOrderModel } from "@/models/PosOrder";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;

    await connectMongo();
    const rows = await PosOrderModel.find({ source: "pos" }).sort({ createdAt: -1 }).limit(limit).lean();

    return NextResponse.json(
      {
        ok: true,
        transactions: rows.map((row) => ({
          id: row._id.toString(),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          note: row.note ?? null,
          createdBy: row.createdBy ?? null,
          totals: row.totals,
          lineItems: row.lineItems || [],
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to load POS transactions", error);
    return NextResponse.json({ ok: false, error: "failed_to_load_transactions" }, { status: 500 });
  }
}
