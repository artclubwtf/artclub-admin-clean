import { Types } from "mongoose";

import { appendPosAuditLog } from "@/lib/pos/audit";
import { getPublicS3Url, uploadToS3 } from "@/lib/s3";
import { CounterModel } from "@/models/Counter";
import { PosLocationModel } from "@/models/PosLocation";
import { PosTerminalModel } from "@/models/PosTerminal";
import { POSTransactionModel } from "@/models/PosTransaction";

type VatRate = 0 | 7 | 19;

type SellerData = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  vatId?: string;
  taxId?: string;
};

function getSellerData(): SellerData {
  return {
    name: process.env.POS_SELLER_NAME?.trim() || "Artclub",
    addressLine1: process.env.POS_SELLER_ADDRESS_LINE1?.trim() || "Seller address line 1",
    addressLine2: process.env.POS_SELLER_ADDRESS_LINE2?.trim() || "Seller address line 2",
    vatId: process.env.POS_SELLER_VAT_ID?.trim() || undefined,
    taxId: process.env.POS_SELLER_TAX_ID?.trim() || undefined,
  };
}

function formatCents(cents: number) {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

function formatDateTime(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

function sanitizeAscii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(value: string) {
  return sanitizeAscii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxChars = 94) {
  if (line.length <= maxChars) return [line];
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += maxChars) chunks.push(line.slice(i, i + maxChars));
    return chunks;
  }

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildSimplePdf(lines: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const lineHeight = 14;
  const top = 802;
  const bottom = 48;
  const linesPerPage = Math.max(1, Math.floor((top - bottom) / lineHeight));

  const flatLines = lines.flatMap((line) => wrapLine(line));
  const pages: string[][] = [];
  for (let i = 0; i < flatLines.length; i += linesPerPage) {
    pages.push(flatLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageObjectIds: number[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const pageObjectId = 4 + i * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);

    const contentLines = pages[i]
      .map((line) => `(${escapePdfText(line)}) Tj`)
      .join("\nT*\n");
    const contentStream = `BT\n/F1 10 Tf\n${lineHeight} TL\n40 ${top} Td\n${contentLines || "() Tj"}\nET\n`;
    const contentLength = Buffer.byteLength(contentStream, "utf8");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    objects.push(`<< /Length ${contentLength} >>\nstream\n${contentStream}endstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

type VatBreakdownLine = {
  rate: VatRate;
  grossCents: number;
  netCents: number;
  vatCents: number;
};

function computeNetCents(grossCents: number, vatRate: VatRate) {
  if (vatRate === 0) return grossCents;
  return Math.round((grossCents * 100) / (100 + vatRate));
}

function computeVatBreakdown(
  items: Array<{ qty: number; unitGrossCents: number; vatRate: VatRate }>,
): VatBreakdownLine[] {
  const map = new Map<VatRate, VatBreakdownLine>();
  for (const item of items) {
    const gross = item.qty * item.unitGrossCents;
    const net = computeNetCents(gross, item.vatRate);
    const vat = gross - net;
    const existing = map.get(item.vatRate) || { rate: item.vatRate, grossCents: 0, netCents: 0, vatCents: 0 };
    existing.grossCents += gross;
    existing.netCents += net;
    existing.vatCents += vat;
    map.set(item.vatRate, existing);
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

async function nextNumber(scope: "receipt" | "invoice", date: Date) {
  const year = date.getUTCFullYear();
  const counter = await CounterModel.findOneAndUpdate(
    { scope, year },
    { $inc: { value: 1 } },
    { upsert: true, new: true },
  );
  const value = Math.max(1, counter.value);
  const prefix = scope === "receipt" ? "R" : "I";
  return `${prefix}-${year}-${String(value).padStart(6, "0")}`;
}

function shouldIssueInvoice(buyerType: string | undefined, grossCents: number) {
  if (buyerType === "b2b") return grossCents >= 20_000;
  if (buyerType === "b2c") return grossCents >= 100_000;
  return false;
}

function hasRequiredInvoiceBuyerData(input: {
  buyerType?: string;
  name?: string;
  company?: string;
  billingAddress?: string;
}) {
  const name = input.name?.trim();
  const billingAddress = input.billingAddress?.trim();
  const company = input.company?.trim();

  if (!name || !billingAddress) return false;
  if (input.buyerType === "b2b" && !company) return false;
  return true;
}

function buildReceiptLines(input: {
  seller: SellerData;
  txId: string;
  receiptNo: string;
  createdAt: Date;
  items: Array<{ titleSnapshot: string; qty: number; unitGrossCents: number; vatRate: VatRate }>;
  totals: { grossCents: number; netCents: number; vatCents: number };
  paymentMethod: string;
  locationName?: string;
  terminalLabel?: string;
}) {
  const vatLines = computeVatBreakdown(input.items);
  const lines: string[] = [];
  lines.push("Receipt (Beleg)");
  lines.push("");
  lines.push(`Seller: ${input.seller.name}`);
  lines.push(`Address: ${input.seller.addressLine1}`);
  lines.push(`${input.seller.addressLine2}`);
  if (input.seller.vatId) lines.push(`VAT ID: ${input.seller.vatId}`);
  if (input.seller.taxId) lines.push(`Tax ID: ${input.seller.taxId}`);
  lines.push("");
  lines.push(`Receipt number: ${input.receiptNo}`);
  lines.push(`Transaction ID: ${input.txId}`);
  lines.push(`Date/Time: ${formatDateTime(input.createdAt)}`);
  if (input.locationName) lines.push(`Location: ${input.locationName}`);
  if (input.terminalLabel) lines.push(`Terminal: ${input.terminalLabel}`);
  lines.push(`Payment method: ${input.paymentMethod}`);
  lines.push("");
  lines.push("Items:");
  for (const item of input.items) {
    const lineGross = item.qty * item.unitGrossCents;
    lines.push(
      `- ${item.titleSnapshot} | qty ${item.qty} | unit ${formatCents(item.unitGrossCents)} | VAT ${item.vatRate}% | line ${formatCents(lineGross)}`,
    );
  }
  lines.push("");
  lines.push("VAT breakdown:");
  for (const vat of vatLines) {
    lines.push(`- VAT ${vat.rate}%: net ${formatCents(vat.netCents)} | VAT ${formatCents(vat.vatCents)} | gross ${formatCents(vat.grossCents)}`);
  }
  lines.push("");
  lines.push(`Net total: ${formatCents(input.totals.netCents)}`);
  lines.push(`VAT total: ${formatCents(input.totals.vatCents)}`);
  lines.push(`Gross total: ${formatCents(input.totals.grossCents)}`);
  return lines;
}

function buildInvoiceLines(input: {
  seller: SellerData;
  txId: string;
  invoiceNo: string;
  createdAt: Date;
  items: Array<{ titleSnapshot: string; qty: number; unitGrossCents: number; vatRate: VatRate }>;
  totals: { grossCents: number; netCents: number; vatCents: number };
  buyer: {
    type?: string;
    name?: string;
    company?: string;
    billingAddress?: string;
  };
}) {
  const vatLines = computeVatBreakdown(input.items);
  const lines: string[] = [];
  lines.push("Invoice");
  lines.push("");
  lines.push(`Seller: ${input.seller.name}`);
  lines.push(`Seller address: ${input.seller.addressLine1}`);
  lines.push(`${input.seller.addressLine2}`);
  if (input.seller.vatId) lines.push(`Seller VAT ID: ${input.seller.vatId}`);
  if (input.seller.taxId) lines.push(`Seller Tax ID: ${input.seller.taxId}`);
  lines.push("");
  lines.push(`Invoice number: ${input.invoiceNo}`);
  lines.push(`Invoice date: ${formatDateTime(input.createdAt)}`);
  lines.push(`Related transaction: ${input.txId}`);
  lines.push("");
  lines.push("Buyer:");
  lines.push(`Name: ${input.buyer.name || "-"}`);
  lines.push(`Company: ${input.buyer.company || "-"}`);
  lines.push(`Address: ${input.buyer.billingAddress || "-"}`);
  lines.push(`Buyer type: ${input.buyer.type || "-"}`);
  lines.push("");
  lines.push("Line items:");
  for (const item of input.items) {
    const lineGross = item.qty * item.unitGrossCents;
    lines.push(
      `- ${item.titleSnapshot} | qty ${item.qty} | unit ${formatCents(item.unitGrossCents)} | VAT ${item.vatRate}% | gross ${formatCents(lineGross)}`,
    );
  }
  lines.push("");
  lines.push("VAT summary:");
  for (const vat of vatLines) {
    lines.push(`- VAT ${vat.rate}%: net ${formatCents(vat.netCents)} | VAT ${formatCents(vat.vatCents)} | gross ${formatCents(vat.grossCents)}`);
  }
  lines.push("");
  lines.push(`Net total: ${formatCents(input.totals.netCents)}`);
  lines.push(`VAT total: ${formatCents(input.totals.vatCents)}`);
  lines.push(`Gross total: ${formatCents(input.totals.grossCents)}`);
  return lines;
}

function safeS3Segment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function resolvePdfUrl(key: string, uploadedUrl?: string) {
  return getPublicS3Url(key) || uploadedUrl || key;
}

export async function ensurePaidTransactionDocuments(txId: string | Types.ObjectId, actorAdminId: string | Types.ObjectId) {
  const normalizedTxId = txId instanceof Types.ObjectId ? txId : new Types.ObjectId(txId);
  const adminId = actorAdminId instanceof Types.ObjectId ? actorAdminId : new Types.ObjectId(actorAdminId);

  const tx = await POSTransactionModel.findById(normalizedTxId).lean();
  if (!tx || tx.status !== "paid") return;

  const [location, terminal] = await Promise.all([
    tx.locationId ? PosLocationModel.findById(tx.locationId).lean() : Promise.resolve(null),
    tx.terminalId ? PosTerminalModel.findById(tx.terminalId).lean() : Promise.resolve(null),
  ]);

  const paidAt = tx.payment?.approvedAt || tx.updatedAt || tx.createdAt || new Date();
  const seller = getSellerData();

  const updates: Record<string, unknown> = {};

  let receiptNo = tx.receipt?.receiptNo;
  if (!tx.receipt?.pdfUrl) {
    if (!receiptNo) {
      receiptNo = await nextNumber("receipt", paidAt);
      updates["receipt.receiptNo"] = receiptNo;
    }

    const receiptLines = buildReceiptLines({
      seller,
      txId: tx._id.toString(),
      receiptNo,
      createdAt: paidAt,
      items: tx.items || [],
      totals: tx.totals,
      paymentMethod: tx.payment?.method || "card",
      locationName: location?.name,
      terminalLabel: terminal?.label,
    });
    const receiptPdf = buildSimplePdf(receiptLines);
    const receiptYear = paidAt.getUTCFullYear();
    const receiptKey = `pos/receipts/${receiptYear}/${safeS3Segment(receiptNo)}.pdf`;
    const uploadedReceipt = await uploadToS3(receiptKey, receiptPdf, "application/pdf", `${safeS3Segment(receiptNo)}.pdf`);
    const receiptUrl = resolvePdfUrl(receiptKey, uploadedReceipt.url);

    updates["receipt.pdfUrl"] = receiptUrl;
    updates["receipt.receiptNo"] = receiptNo;

    await appendPosAuditLog({
      actorAdminId: adminId,
      action: "ISSUE_RECEIPT",
      txId: tx._id,
      payload: {
        receiptNo,
        pdfUrl: receiptUrl,
      },
    });
  }

  const invoiceRequired = shouldIssueInvoice(tx.buyer?.type, tx.totals?.grossCents || 0);
  let invoiceNo = tx.invoice?.invoiceNo;
  const invoiceBuyerData = {
    type: tx.buyer?.type,
    name: tx.buyer?.name,
    company: tx.buyer?.company ?? undefined,
    billingAddress: tx.buyer?.billingAddress ?? tx.buyer?.shippingAddress ?? undefined,
  };

  if (invoiceRequired && !tx.invoice?.pdfUrl) {
    if (!hasRequiredInvoiceBuyerData(invoiceBuyerData)) {
      updates["invoice.skippedReason"] = "missing_buyer";

      if (tx.invoice?.skippedReason !== "missing_buyer") {
        await appendPosAuditLog({
          actorAdminId: adminId,
          action: "INVOICE_SKIPPED_MISSING_BUYER",
          txId: tx._id,
          payload: {
            reason: "missing_buyer",
            buyerType: tx.buyer?.type ?? null,
            grossCents: tx.totals?.grossCents ?? null,
          },
        });
      }
    } else {
      if (!invoiceNo) {
        invoiceNo = await nextNumber("invoice", paidAt);
        updates["invoice.invoiceNo"] = invoiceNo;
      }

      const invoiceLines = buildInvoiceLines({
        seller,
        txId: tx._id.toString(),
        invoiceNo,
        createdAt: paidAt,
        items: tx.items || [],
        totals: tx.totals,
        buyer: invoiceBuyerData,
      });

      const invoicePdf = buildSimplePdf(invoiceLines);
      const invoiceYear = paidAt.getUTCFullYear();
      const invoiceKey = `pos/invoices/${invoiceYear}/${safeS3Segment(invoiceNo)}.pdf`;
      const uploadedInvoice = await uploadToS3(invoiceKey, invoicePdf, "application/pdf", `${safeS3Segment(invoiceNo)}.pdf`);
      const invoiceUrl = resolvePdfUrl(invoiceKey, uploadedInvoice.url);

      updates["invoice.pdfUrl"] = invoiceUrl;
      updates["invoice.invoiceNo"] = invoiceNo;
      updates["invoice.skippedReason"] = null;

      await appendPosAuditLog({
        actorAdminId: adminId,
        action: "ISSUE_INVOICE",
        txId: tx._id,
        payload: {
          invoiceNo,
          pdfUrl: invoiceUrl,
        },
      });
    }
  }

  if (Object.keys(updates).length > 0) {
    await POSTransactionModel.updateOne({ _id: tx._id }, { $set: updates });
  }
}
