import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { buildZip, parseDateRangeFromQuery, toCsv } from "@/lib/pos/exports";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosAuditLogModel } from "@/models/PosAuditLog";
import { POSTransactionModel } from "@/models/PosTransaction";

type TxExportRow = {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  locationId?: Types.ObjectId;
  terminalId?: Types.ObjectId;
  status: string;
  buyer?: {
    type?: string;
    name?: string;
    company?: string;
    email?: string;
  };
  totals?: {
    grossCents?: number;
    netCents?: number;
    vatCents?: number;
  };
  items?: Array<{
    itemId?: Types.ObjectId;
    qty?: number;
    unitGrossCents?: number;
    vatRate?: number;
    titleSnapshot?: string;
  }>;
  payment?: {
    provider?: string;
    providerTxId?: string;
    method?: string;
    tipCents?: number;
    approvedAt?: Date;
  };
  tse?: {
    provider?: string;
    txId?: string;
    serial?: string;
    signature?: string;
    signatureCounter?: number;
    logTime?: Date;
    startedAt?: Date;
    finishedAt?: Date;
  };
  receipt?: {
    receiptNo?: string;
    pdfUrl?: string;
  };
  invoice?: {
    invoiceNo?: string;
    pdfUrl?: string;
  };
  contract?: {
    contractId?: Types.ObjectId;
    pdfUrl?: string;
  };
};

type AuditExportRow = {
  _id: Types.ObjectId;
  createdAt?: Date;
  actorAdminId?: Types.ObjectId;
  action: string;
  txId?: Types.ObjectId;
  prevHash?: string;
  hash?: string;
  payload?: unknown;
};

function iso(value?: Date | null) {
  return value instanceof Date ? value.toISOString() : "";
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const range = parseDateRangeFromQuery(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!range) {
    return NextResponse.json({ ok: false, error: "invalid_date_range" }, { status: 400 });
  }

  try {
    await connectMongo();

    const txs = (await POSTransactionModel.find({
      createdAt: { $gte: range.from, $lte: range.to },
    })
      .sort({ createdAt: 1 })
      .lean()) as TxExportRow[];

    const txIds = txs.map((tx) => tx._id);
    const audits = (await PosAuditLogModel.find({
      $or: [{ createdAt: { $gte: range.from, $lte: range.to } }, { txId: { $in: txIds } }],
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean()) as AuditExportRow[];

    const transactionsRows = txs.map((tx) => ({
      tx_id: tx._id.toString(),
      created_at: iso(tx.createdAt),
      updated_at: iso(tx.updatedAt),
      status: tx.status || "",
      location_id: tx.locationId?.toString() || "",
      terminal_id: tx.terminalId?.toString() || "",
      buyer_type: tx.buyer?.type || "",
      buyer_name: tx.buyer?.name || "",
      buyer_company: tx.buyer?.company || "",
      buyer_email: tx.buyer?.email || "",
      gross_cents: tx.totals?.grossCents ?? 0,
      net_cents: tx.totals?.netCents ?? 0,
      vat_cents: tx.totals?.vatCents ?? 0,
      receipt_no: tx.receipt?.receiptNo || "",
      receipt_pdf_url: tx.receipt?.pdfUrl || "",
      invoice_no: tx.invoice?.invoiceNo || "",
      invoice_pdf_url: tx.invoice?.pdfUrl || "",
      contract_id: tx.contract?.contractId?.toString() || "",
      contract_pdf_url: tx.contract?.pdfUrl || "",
    }));

    const linesRows = txs.flatMap((tx) =>
      (tx.items || []).map((line, idx) => ({
        tx_id: tx._id.toString(),
        line_no: idx + 1,
        item_id: line.itemId?.toString() || "",
        title_snapshot: line.titleSnapshot || "",
        qty: line.qty ?? 0,
        unit_gross_cents: line.unitGrossCents ?? 0,
        vat_rate: line.vatRate ?? "",
        line_gross_cents: (line.qty ?? 0) * (line.unitGrossCents ?? 0),
      })),
    );

    const paymentsRows = txs.map((tx) => ({
      tx_id: tx._id.toString(),
      status: tx.status || "",
      provider: tx.payment?.provider || "",
      provider_tx_id: tx.payment?.providerTxId || "",
      method: tx.payment?.method || "",
      tip_cents: tx.payment?.tipCents ?? 0,
      approved_at: iso(tx.payment?.approvedAt),
      gross_cents: tx.totals?.grossCents ?? 0,
    }));

    const tseRows = txs.map((tx) => ({
      tx_id: tx._id.toString(),
      tse_provider: tx.tse?.provider || "",
      tse_tx_id: tx.tse?.txId || "",
      serial: tx.tse?.serial || "",
      signature: tx.tse?.signature || "",
      signature_counter: tx.tse?.signatureCounter ?? "",
      log_time: iso(tx.tse?.logTime),
      started_at: iso(tx.tse?.startedAt),
      finished_at: iso(tx.tse?.finishedAt),
    }));

    const auditRows = audits.map((log) => ({
      audit_id: log._id.toString(),
      created_at: iso(log.createdAt),
      actor_admin_id: log.actorAdminId?.toString() || "",
      action: log.action || "",
      tx_id: log.txId?.toString() || "",
      prev_hash: log.prevHash || "",
      hash: log.hash || "",
      payload_json: JSON.stringify(log.payload ?? {}),
    }));

    const readme = [
      "DSFinV-K Export Skeleton",
      "Version: 0.1.0-skeleton",
      `Range from: ${range.from.toISOString()}`,
      `Range to: ${range.to.toISOString()}`,
      "",
      "Files:",
      "- transactions.csv: POS transaction master data",
      "- lines.csv: line items per transaction",
      "- payments.csv: payment-related fields per transaction",
      "- tse.csv: TSE-related fields per transaction",
      "- audit.csv: append-only audit trail with hash-chain values",
      "",
      "Mapping notes:",
      "- tx_id maps to POSTransaction._id",
      "- cents fields are integer cent amounts",
      "- timestamps are ISO-8601 UTC",
      "- this is an extendable skeleton, not full DSFinV-K certification output",
      "",
    ].join("\n");

    const zip = buildZip([
      {
        name: "transactions.csv",
        content: toCsv(
          [
            "tx_id",
            "created_at",
            "updated_at",
            "status",
            "location_id",
            "terminal_id",
            "buyer_type",
            "buyer_name",
            "buyer_company",
            "buyer_email",
            "gross_cents",
            "net_cents",
            "vat_cents",
            "receipt_no",
            "receipt_pdf_url",
            "invoice_no",
            "invoice_pdf_url",
            "contract_id",
            "contract_pdf_url",
          ],
          transactionsRows,
        ),
      },
      {
        name: "lines.csv",
        content: toCsv(
          ["tx_id", "line_no", "item_id", "title_snapshot", "qty", "unit_gross_cents", "vat_rate", "line_gross_cents"],
          linesRows,
        ),
      },
      {
        name: "payments.csv",
        content: toCsv(["tx_id", "status", "provider", "provider_tx_id", "method", "tip_cents", "approved_at", "gross_cents"], paymentsRows),
      },
      {
        name: "tse.csv",
        content: toCsv(
          ["tx_id", "tse_provider", "tse_tx_id", "serial", "signature", "signature_counter", "log_time", "started_at", "finished_at"],
          tseRows,
        ),
      },
      {
        name: "audit.csv",
        content: toCsv(["audit_id", "created_at", "actor_admin_id", "action", "tx_id", "prev_hash", "hash", "payload_json"], auditRows),
      },
      { name: "README.txt", content: readme },
    ]);

    const filename = `dsfinvk-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.zip`;
    return new NextResponse(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export DSFinV-K skeleton", error);
    const message = error instanceof Error ? error.message : "failed_to_export_dsfinvk";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
