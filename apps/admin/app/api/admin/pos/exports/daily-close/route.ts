import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { buildSimplePdf, parseSingleDateFromQuery } from "@/lib/pos/exports";
import { requireAdmin } from "@/lib/requireAdmin";
import { POSTransactionModel } from "@/models/PosTransaction";

type DailyTxRow = {
  _id: { toString(): string };
  status: "created" | "payment_pending" | "paid" | "failed" | "cancelled" | "refunded" | "storno";
  createdAt?: Date;
  totals?: {
    grossCents?: number;
    netCents?: number;
    vatCents?: number;
  };
  items?: Array<{
    qty?: number;
    unitGrossCents?: number;
    vatRate?: 0 | 7 | 19;
  }>;
};

function computeNetCents(grossCents: number, vatRate: 0 | 7 | 19) {
  if (vatRate === 0) return grossCents;
  return Math.round((grossCents * 100) / (100 + vatRate));
}

function formatCents(cents: number) {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const parsed = parseSingleDateFromQuery(url.searchParams.get("date"));
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
  }

  const format = (url.searchParams.get("format") || "json").toLowerCase();

  try {
    await connectMongo();

    const rows = (await POSTransactionModel.find({
      createdAt: { $gte: parsed.start, $lte: parsed.end },
    }).lean()) as DailyTxRow[];

    let grossPaidCents = 0;
    let netPaidCents = 0;
    let vatPaidCents = 0;
    let refundGrossCents = 0;
    let stornoGrossCents = 0;

    const vatBucketsMap = new Map<0 | 7 | 19, { grossCents: number; netCents: number; vatCents: number }>();
    for (const rate of [0, 7, 19] as const) {
      vatBucketsMap.set(rate, { grossCents: 0, netCents: 0, vatCents: 0 });
    }

    const counts = {
      total: rows.length,
      paid: 0,
      created: 0,
      payment_pending: 0,
      failed: 0,
      cancelled: 0,
      refunded: 0,
      storno: 0,
    };

    for (const tx of rows) {
      counts[tx.status] += 1;

      if (tx.status === "paid") {
        grossPaidCents += tx.totals?.grossCents ?? 0;
        netPaidCents += tx.totals?.netCents ?? 0;
        vatPaidCents += tx.totals?.vatCents ?? 0;

        for (const line of tx.items || []) {
          const rate = (line.vatRate ?? 19) as 0 | 7 | 19;
          const qty = line.qty ?? 0;
          const unit = line.unitGrossCents ?? 0;
          const lineGross = qty * unit;
          const lineNet = computeNetCents(lineGross, rate);
          const bucket = vatBucketsMap.get(rate) || { grossCents: 0, netCents: 0, vatCents: 0 };
          bucket.grossCents += lineGross;
          bucket.netCents += lineNet;
          bucket.vatCents += lineGross - lineNet;
          vatBucketsMap.set(rate, bucket);
        }
      }

      if (tx.status === "refunded") {
        refundGrossCents += tx.totals?.grossCents ?? 0;
      }
      if (tx.status === "storno") {
        stornoGrossCents += tx.totals?.grossCents ?? 0;
      }
    }

    const vatBuckets = Array.from(vatBucketsMap.entries()).map(([rate, values]) => ({
      vatRate: rate,
      grossCents: values.grossCents,
      netCents: values.netCents,
      vatCents: values.vatCents,
    }));

    const payload = {
      ok: true,
      date: parsed.date,
      range: {
        from: parsed.start.toISOString(),
        to: parsed.end.toISOString(),
      },
      summary: {
        transactionCount: counts.total,
        paidCount: counts.paid,
        createdCount: counts.created,
        pendingCount: counts.payment_pending,
        failedCount: counts.failed,
        cancelledCount: counts.cancelled,
        refundedCount: counts.refunded,
        stornoCount: counts.storno,
        grossPaidCents,
        netPaidCents,
        vatPaidCents,
        refundGrossCents,
        stornoGrossCents,
      },
      vatBuckets,
    };

    if (format !== "pdf") {
      return NextResponse.json(payload, { status: 200 });
    }

    const lines: string[] = [];
    lines.push("Daily Close Report (Skeleton)");
    lines.push(`Date: ${parsed.date}`);
    lines.push(`Range: ${parsed.start.toISOString()} to ${parsed.end.toISOString()}`);
    lines.push("");
    lines.push(`Transactions total: ${payload.summary.transactionCount}`);
    lines.push(`Paid: ${payload.summary.paidCount}`);
    lines.push(`Pending: ${payload.summary.pendingCount}`);
    lines.push(`Failed: ${payload.summary.failedCount}`);
    lines.push(`Cancelled: ${payload.summary.cancelledCount}`);
    lines.push(`Refunded: ${payload.summary.refundedCount}`);
    lines.push(`Storno: ${payload.summary.stornoCount}`);
    lines.push("");
    lines.push(`Gross paid: ${formatCents(payload.summary.grossPaidCents)}`);
    lines.push(`Net paid: ${formatCents(payload.summary.netPaidCents)}`);
    lines.push(`VAT paid: ${formatCents(payload.summary.vatPaidCents)}`);
    lines.push(`Refund gross: ${formatCents(payload.summary.refundGrossCents)}`);
    lines.push(`Storno gross: ${formatCents(payload.summary.stornoGrossCents)}`);
    lines.push("");
    lines.push("VAT buckets:");
    for (const bucket of vatBuckets) {
      lines.push(
        `VAT ${bucket.vatRate}% -> gross ${formatCents(bucket.grossCents)}, net ${formatCents(bucket.netCents)}, VAT ${formatCents(bucket.vatCents)}`,
      );
    }

    const pdf = buildSimplePdf(lines);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="daily-close-${parsed.date}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate daily close report", error);
    const message = error instanceof Error ? error.message : "failed_to_generate_daily_close";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
