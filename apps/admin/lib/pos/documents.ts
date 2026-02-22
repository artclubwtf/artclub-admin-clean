import { Types } from "mongoose";

import { appendPosAuditLog } from "@/lib/pos/audit";
import { getOrCreatePosSettings } from "@/lib/pos/settings";
import { getPublicS3Url, uploadToS3 } from "@/lib/s3";
import { CounterModel } from "@/models/Counter";
import { PosLocationModel } from "@/models/PosLocation";
import { PosTerminalModel } from "@/models/PosTerminal";
import { POSTransactionModel } from "@/models/PosTransaction";

type VatRate = 0 | 7 | 19;

type SellerData = {
  brandName: string;
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  email?: string;
  phone?: string;
  steuernummer?: string;
  finanzamt?: string;
  vatId?: string;
  taxId?: string;
  footerLines: string[];
  locale: string;
  currency: string;
};

async function getSellerData(): Promise<SellerData> {
  const settings = await getOrCreatePosSettings();
  return {
    brandName: settings.brandName,
    companyName: settings.seller.companyName,
    addressLine1: settings.seller.addressLine1,
    addressLine2: settings.seller.addressLine2,
    email: settings.seller.email || undefined,
    phone: settings.seller.phone || undefined,
    steuernummer: settings.tax.steuernummer || undefined,
    finanzamt: settings.tax.finanzamt || undefined,
    vatId: settings.tax.ustId || undefined,
    taxId: settings.tax.steuernummer || undefined,
    footerLines: settings.receiptFooterLines,
    locale: settings.locale || "de-DE",
    currency: settings.currency || "EUR",
  };
}

function formatCents(cents: number, seller: Pick<SellerData, "currency" | "locale">) {
  try {
    return new Intl.NumberFormat(seller.locale, {
      style: "currency",
      currency: seller.currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${seller.currency || "EUR"} ${(cents / 100).toFixed(2)}`;
  }
}

function formatDateTime(value: Date) {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  } catch {
    return value.toISOString().replace("T", " ").slice(0, 19);
  }
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

function pushSection(lines: string[], title: string, rows: string[]) {
  lines.push(`==== ${title.toUpperCase()} ====`);
  for (const row of rows) lines.push(row);
  lines.push("");
}

function compactBuyerLines(input: {
  type?: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
}) {
  const rows: string[] = [];
  if (input.type) rows.push(`Type: ${input.type.toUpperCase()}`);
  if (input.name) rows.push(`Name: ${input.name}`);
  if (input.company) rows.push(`Company: ${input.company}`);
  if (input.email) rows.push(`Email: ${input.email}`);
  if (input.phone) rows.push(`Phone: ${input.phone}`);
  if (input.billingAddress) rows.push(`Billing: ${input.billingAddress}`);
  if (input.shippingAddress && input.shippingAddress !== input.billingAddress) rows.push(`Shipping: ${input.shippingAddress}`);
  return rows;
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
  buyer?: {
    type?: string;
    name?: string;
    company?: string;
    email?: string;
    phone?: string;
    billingAddress?: string;
    shippingAddress?: string;
  };
  tse?: {
    provider?: string;
    txId?: string;
    serial?: string;
    signatureCounter?: number;
    logTime?: Date | null;
    signature?: string;
  };
}) {
  const vatLines = computeVatBreakdown(input.items);
  const lines: string[] = [];
  lines.push(`${input.seller.brandName}`);
  lines.push("Receipt / Beleg");
  lines.push(`Receipt No: ${input.receiptNo}`);
  lines.push(`Date/Time: ${formatDateTime(input.createdAt)}`);
  lines.push(`Transaction: ${input.txId}`);
  if (input.locationName) lines.push(`Location: ${input.locationName}`);
  if (input.terminalLabel) lines.push(`Terminal: ${input.terminalLabel}`);
  lines.push("");

  const summaryRows: string[] = [];
  for (const item of input.items) {
    const lineGross = item.qty * item.unitGrossCents;
    summaryRows.push(`${item.qty} x ${item.titleSnapshot}`);
    summaryRows.push(`  Unit ${formatCents(item.unitGrossCents, input.seller)} | VAT ${item.vatRate}% | Line ${formatCents(lineGross, input.seller)}`);
  }
  summaryRows.push("---");
  summaryRows.push(`Subtotal (net): ${formatCents(input.totals.netCents, input.seller)}`);
  for (const vat of vatLines) {
    summaryRows.push(`VAT ${vat.rate}%: ${formatCents(vat.vatCents, input.seller)} (gross ${formatCents(vat.grossCents, input.seller)})`);
  }
  summaryRows.push(`VAT total: ${formatCents(input.totals.vatCents, input.seller)}`);
  summaryRows.push(`TOTAL: ${formatCents(input.totals.grossCents, input.seller)}`);
  summaryRows.push(`Payment method: ${input.paymentMethod}`);
  pushSection(lines, "Order Summary", summaryRows);

  const buyerRows = compactBuyerLines(input.buyer || {});
  if (buyerRows.length > 0) {
    pushSection(lines, "Customer", buyerRows);
  }

  const sellerRows = [
    input.seller.companyName,
    input.seller.addressLine1,
    input.seller.addressLine2,
    ...(input.seller.email ? [`Email: ${input.seller.email}`] : []),
    ...(input.seller.phone ? [`Phone: ${input.seller.phone}`] : []),
    ...(input.seller.steuernummer ? [`Steuernummer: ${input.seller.steuernummer}`] : []),
    ...(input.seller.vatId ? [`USt-IdNr.: ${input.seller.vatId}`] : []),
    ...(input.seller.finanzamt ? [`Finanzamt: ${input.seller.finanzamt}`] : []),
  ];
  pushSection(lines, "Seller & Tax", sellerRows);

  if (input.tse?.provider) {
    const signature = input.tse.signature || "-";
    const compactSignature = signature.length > 180 ? `${signature.slice(0, 180)}...` : signature;
    pushSection(lines, "TSE", [
      `Provider: ${input.tse.provider}`,
      `Serial: ${input.tse.serial || "-"}`,
      `TSE Tx: ${input.tse.txId || "-"}`,
      `Signature Counter: ${typeof input.tse.signatureCounter === "number" ? input.tse.signatureCounter : "-"}`,
      `Log Time: ${input.tse.logTime ? formatDateTime(new Date(input.tse.logTime)) : "-"}`,
      `Signature: ${compactSignature}`,
    ]);
  }

  if (input.seller.footerLines.length > 0) {
    pushSection(lines, "Footer", input.seller.footerLines);
  }
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
    email?: string;
    phone?: string;
    billingAddress?: string;
    shippingAddress?: string;
  };
  tse?: {
    provider?: string;
    txId?: string;
    serial?: string;
    signatureCounter?: number;
    logTime?: Date | null;
    signature?: string;
  };
}) {
  const vatLines = computeVatBreakdown(input.items);
  const lines: string[] = [];
  lines.push(`${input.seller.brandName}`);
  lines.push("Invoice");
  lines.push(`Invoice No: ${input.invoiceNo}`);
  lines.push(`Date/Time: ${formatDateTime(input.createdAt)}`);
  lines.push(`Related transaction: ${input.txId}`);
  lines.push("");

  const summaryRows: string[] = [];
  for (const item of input.items) {
    const lineGross = item.qty * item.unitGrossCents;
    summaryRows.push(`${item.qty} x ${item.titleSnapshot}`);
    summaryRows.push(`  Unit ${formatCents(item.unitGrossCents, input.seller)} | VAT ${item.vatRate}% | Line ${formatCents(lineGross, input.seller)}`);
  }
  summaryRows.push("---");
  summaryRows.push(`Subtotal (net): ${formatCents(input.totals.netCents, input.seller)}`);
  for (const vat of vatLines) {
    summaryRows.push(`VAT ${vat.rate}%: ${formatCents(vat.vatCents, input.seller)} (gross ${formatCents(vat.grossCents, input.seller)})`);
  }
  summaryRows.push(`VAT total: ${formatCents(input.totals.vatCents, input.seller)}`);
  summaryRows.push(`TOTAL: ${formatCents(input.totals.grossCents, input.seller)}`);
  pushSection(lines, "Order Summary", summaryRows);

  pushSection(lines, "Customer", compactBuyerLines(input.buyer));

  const sellerRows = [
    input.seller.companyName,
    input.seller.addressLine1,
    input.seller.addressLine2,
    ...(input.seller.email ? [`Email: ${input.seller.email}`] : []),
    ...(input.seller.phone ? [`Phone: ${input.seller.phone}`] : []),
    ...(input.seller.steuernummer ? [`Steuernummer: ${input.seller.steuernummer}`] : []),
    ...(input.seller.vatId ? [`USt-IdNr.: ${input.seller.vatId}`] : []),
    ...(input.seller.finanzamt ? [`Finanzamt: ${input.seller.finanzamt}`] : []),
  ];
  pushSection(lines, "Seller & Tax", sellerRows);

  if (input.tse?.provider) {
    const signature = input.tse.signature || "-";
    const compactSignature = signature.length > 180 ? `${signature.slice(0, 180)}...` : signature;
    pushSection(lines, "TSE", [
      `Provider: ${input.tse.provider}`,
      `Serial: ${input.tse.serial || "-"}`,
      `TSE Tx: ${input.tse.txId || "-"}`,
      `Signature Counter: ${typeof input.tse.signatureCounter === "number" ? input.tse.signatureCounter : "-"}`,
      `Log Time: ${input.tse.logTime ? formatDateTime(new Date(input.tse.logTime)) : "-"}`,
      `Signature: ${compactSignature}`,
    ]);
  }

  if (input.seller.footerLines.length > 0) {
    pushSection(lines, "Footer", input.seller.footerLines);
  }
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
  const seller = await getSellerData();

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
      buyer: tx.buyer
        ? {
            type: tx.buyer.type,
            name: tx.buyer.name,
            company: tx.buyer.company ?? undefined,
            email: tx.buyer.email ?? undefined,
            phone: tx.buyer.phone ?? undefined,
            billingAddress: tx.buyer.billingAddress ?? undefined,
            shippingAddress: tx.buyer.shippingAddress ?? undefined,
          }
        : undefined,
      tse: tx.tse
        ? {
            provider: tx.tse.provider ?? undefined,
            txId: tx.tse.txId ?? undefined,
            serial: tx.tse.serial ?? undefined,
            signatureCounter: tx.tse.signatureCounter ?? undefined,
            logTime: tx.tse.logTime ?? null,
            signature: tx.tse.signature ?? undefined,
          }
        : undefined,
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
    email: tx.buyer?.email ?? undefined,
    phone: tx.buyer?.phone ?? undefined,
    billingAddress: tx.buyer?.billingAddress ?? tx.buyer?.shippingAddress ?? undefined,
    shippingAddress: tx.buyer?.shippingAddress ?? undefined,
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
        tse: tx.tse
          ? {
              provider: tx.tse.provider ?? undefined,
              txId: tx.tse.txId ?? undefined,
              serial: tx.tse.serial ?? undefined,
              signatureCounter: tx.tse.signatureCounter ?? undefined,
              logTime: tx.tse.logTime ?? null,
              signature: tx.tse.signature ?? undefined,
            }
          : undefined,
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
