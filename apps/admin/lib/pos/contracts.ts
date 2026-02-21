import { Types } from "mongoose";

import { appendPosAuditLog } from "@/lib/pos/audit";
import { getPublicS3Url, uploadToS3 } from "@/lib/s3";
import { PosContractModel } from "@/models/PosContract";
import { POSTransactionModel } from "@/models/PosTransaction";

export const POS_CONTRACT_TERMS_LINK = "https://artclub.wtf/policies/terms-of-service";

const POS_CONTRACT_SELLER = {
  name: "Artclub Mixed Media GmbH",
  address: "Friedrichsruher Straße 37, 14193 Berlin",
  email: "support@artclub.wtf",
  phone: "+49 176 41534464",
} as const;

type ContractDeliveryMethod = "pickup" | "shipping" | "forwarding";
type ContractEditionType = "unique" | "edition";

export type ArtworkContractInput = {
  artworks: Array<{
    itemId: string;
    artistName?: string;
    title?: string;
    year?: string;
    techniqueSize?: string;
    editionType?: ContractEditionType;
  }>;
  deliveryMethod: ContractDeliveryMethod;
  estimatedDeliveryDate?: string;
  buyerSignatureDataUrl: string;
};

type BuyerData = {
  name: string;
  company?: string;
  billingAddress?: string;
  shippingAddress?: string;
  email?: string;
  phone?: string;
};

type ArtworkLineData = {
  itemId: string;
  artistName?: string;
  title: string;
  qty: number;
  unitGrossCents: number;
};

type Snapshot = {
  templateVersion: "pos-artwork-contract-v1";
  txId: string;
  seller: typeof POS_CONTRACT_SELLER;
  termsLink: typeof POS_CONTRACT_TERMS_LINK;
  artistName: string;
  buyer: {
    name: string;
    company?: string;
    billingAddress?: string;
    shippingAddress?: string;
    email?: string;
    phone?: string;
  };
  artworks: Array<{
    itemId: string;
    title: string;
    artistName: string;
    year?: string;
    techniqueSize?: string;
    editionType: ContractEditionType;
    qty: number;
    unitGrossCents: number;
    lineGrossCents: number;
  }>;
  purchase: {
    grossCents: number;
    status: "open" | "paid";
  };
  delivery: {
    method: ContractDeliveryMethod;
    estimatedDeliveryDate?: string;
  };
  signatures: {
    buyerSignatureImageUrl: string;
    sellerSignature: "Artclub Mixed Media GmbH";
    signedAt: string;
  };
};

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

    const contentLines = pages[i].map((line) => `(${escapePdfText(line)}) Tj`).join("\nT*\n");
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

function toOptionalTrimmed(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatDateTime(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

function formatCents(cents: number) {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

function safeS3Segment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function resolvePdfUrl(key: string, uploadedUrl?: string) {
  return getPublicS3Url(key) || uploadedUrl || key;
}

function parseSignatureDataUrl(signatureDataUrl: string) {
  const match = signatureDataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    throw new Error("invalid_signature_data_url");
  }

  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const data = match[2];
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) throw new Error("invalid_signature_data");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("signature_too_large");

  const extension = mime === "image/png" ? "png" : "jpg";
  return { mime, buffer, extension };
}

function buildSnapshot(input: {
  txId: string;
  buyer: BuyerData;
  artworkLines: ArtworkLineData[];
  contractInput: ArtworkContractInput;
  buyerSignatureImageUrl: string;
  grossCents: number;
  isPaid: boolean;
}) {
  const contractArtworkByItem = new Map(input.contractInput.artworks.map((a) => [a.itemId, a]));
  const artworks = input.artworkLines.map((line) => {
    const override = contractArtworkByItem.get(line.itemId);
    const title = toOptionalTrimmed(override?.title) || line.title;
    const artistName = toOptionalTrimmed(override?.artistName) || toOptionalTrimmed(line.artistName) || "Unknown artist";
    const year = toOptionalTrimmed(override?.year);
    const techniqueSize = toOptionalTrimmed(override?.techniqueSize);
    const editionType = override?.editionType || "unique";

    return {
      itemId: line.itemId,
      title,
      artistName,
      year,
      techniqueSize,
      editionType,
      qty: line.qty,
      unitGrossCents: line.unitGrossCents,
      lineGrossCents: line.qty * line.unitGrossCents,
    };
  });

  const artistName = artworks[0]?.artistName || "Unknown artist";
  const signedAt = new Date();

  const snapshot: Snapshot = {
    templateVersion: "pos-artwork-contract-v1",
    txId: input.txId,
    seller: POS_CONTRACT_SELLER,
    termsLink: POS_CONTRACT_TERMS_LINK,
    artistName,
    buyer: {
      name: input.buyer.name,
      company: toOptionalTrimmed(input.buyer.company),
      billingAddress: toOptionalTrimmed(input.buyer.billingAddress),
      shippingAddress: toOptionalTrimmed(input.buyer.shippingAddress),
      email: toOptionalTrimmed(input.buyer.email),
      phone: toOptionalTrimmed(input.buyer.phone),
    },
    artworks,
    purchase: {
      grossCents: input.grossCents,
      status: input.isPaid ? "paid" : "open",
    },
    delivery: {
      method: input.contractInput.deliveryMethod,
      estimatedDeliveryDate: toOptionalTrimmed(input.contractInput.estimatedDeliveryDate),
    },
    signatures: {
      buyerSignatureImageUrl: input.buyerSignatureImageUrl,
      sellerSignature: "Artclub Mixed Media GmbH",
      signedAt: signedAt.toISOString(),
    },
  };

  return snapshot;
}

function buildContractLines(snapshot: Snapshot) {
  const lines: string[] = [];
  lines.push("Artwork Purchase Contract");
  lines.push("");
  lines.push("Seller:");
  lines.push(`${snapshot.seller.name}`);
  lines.push(`${snapshot.seller.address}`);
  lines.push(`${snapshot.seller.email} | ${snapshot.seller.phone}`);
  lines.push("");
  lines.push(`Transaction ID: ${snapshot.txId}`);
  lines.push(`Contract timestamp: ${formatDateTime(new Date(snapshot.signatures.signedAt))}`);
  lines.push("");
  lines.push("Buyer:");
  lines.push(`Name: ${snapshot.buyer.name}`);
  lines.push(`Company: ${snapshot.buyer.company || "-"}`);
  lines.push(`Billing address: ${snapshot.buyer.billingAddress || "-"}`);
  lines.push(`Shipping address: ${snapshot.buyer.shippingAddress || "-"}`);
  lines.push(`Email: ${snapshot.buyer.email || "-"}`);
  lines.push(`Phone: ${snapshot.buyer.phone || "-"}`);
  lines.push("");
  lines.push("Artwork details:");
  for (const artwork of snapshot.artworks) {
    lines.push(`- Artist: ${artwork.artistName}`);
    lines.push(`  Title: ${artwork.title}`);
    lines.push(`  Year: ${artwork.year || "-"}`);
    lines.push(`  Technique/Size: ${artwork.techniqueSize || "-"}`);
    lines.push(`  Unique/Edition: ${artwork.editionType}`);
    lines.push(`  Qty: ${artwork.qty} | Unit: ${formatCents(artwork.unitGrossCents)} | Line: ${formatCents(artwork.lineGrossCents)}`);
  }
  lines.push("");
  lines.push("Purchase:");
  lines.push(`Total price: ${formatCents(snapshot.purchase.grossCents)}`);
  lines.push(`Payment status: ${snapshot.purchase.status}`);
  lines.push("");
  lines.push("Delivery:");
  lines.push(`Method: ${snapshot.delivery.method}`);
  lines.push(`Estimated delivery date: ${snapshot.delivery.estimatedDeliveryDate || "-"}`);
  lines.push("");
  lines.push(`Terms: ${snapshot.termsLink}`);
  lines.push("");
  lines.push("Signatures:");
  lines.push(`Buyer signature image: ${snapshot.signatures.buyerSignatureImageUrl}`);
  lines.push(`Seller signature: ${snapshot.signatures.sellerSignature}`);
  lines.push(`Signed at: ${formatDateTime(new Date(snapshot.signatures.signedAt))}`);
  return lines;
}

export async function createArtworkContractDraft(params: {
  txId: string | Types.ObjectId;
  buyer: BuyerData;
  artworkLines: ArtworkLineData[];
  contractInput: ArtworkContractInput;
  grossCents: number;
  isPaid: boolean;
}) {
  const txId = params.txId instanceof Types.ObjectId ? params.txId : new Types.ObjectId(params.txId);
  const { mime, buffer, extension } = parseSignatureDataUrl(params.contractInput.buyerSignatureDataUrl);
  const year = new Date().getUTCFullYear();
  const signatureKey = `pos/contracts/signatures/${year}/${safeS3Segment(txId.toString())}-${Date.now()}.${extension}`;
  const uploaded = await uploadToS3(signatureKey, buffer, mime, `signature-${txId.toString()}.${extension}`);
  const buyerSignatureImageUrl = resolvePdfUrl(signatureKey, uploaded.url);

  const snapshot = buildSnapshot({
    txId: txId.toString(),
    buyer: params.buyer,
    artworkLines: params.artworkLines,
    contractInput: params.contractInput,
    buyerSignatureImageUrl,
    grossCents: params.grossCents,
    isPaid: params.isPaid,
  });

  const contract = await PosContractModel.findOneAndUpdate(
    { txId },
    {
      $set: {
        fieldsSnapshot: snapshot,
        buyerSignatureImageUrl,
      },
      $setOnInsert: { txId },
    },
    { upsert: true, new: true },
  );

  await POSTransactionModel.updateOne(
    { _id: txId },
    {
      $set: {
        "contract.contractId": contract._id,
      },
    },
  );

  return {
    contractId: contract._id.toString(),
    buyerSignatureImageUrl,
  };
}

export async function ensurePaidArtworkContractDocument(txId: string | Types.ObjectId, actorAdminId: string | Types.ObjectId) {
  const normalizedTxId = txId instanceof Types.ObjectId ? txId : new Types.ObjectId(txId);
  const adminId = actorAdminId instanceof Types.ObjectId ? actorAdminId : new Types.ObjectId(actorAdminId);

  const tx = await POSTransactionModel.findById(normalizedTxId).lean();
  if (!tx || tx.status !== "paid") return;

  const contract = await PosContractModel.findOne({ txId: normalizedTxId });
  if (!contract) return;

  if (tx.contract?.pdfUrl) {
    const snapshotRecord = ((contract.fieldsSnapshot as Record<string, unknown>) || {}) as Record<string, unknown>;
    const purchaseRecord = ((snapshotRecord.purchase as Record<string, unknown>) || {}) as Record<string, unknown>;
    const nextSnapshot = {
      ...snapshotRecord,
      purchase: {
        ...purchaseRecord,
        status: "paid",
      },
    };
    contract.fieldsSnapshot = nextSnapshot;
    await contract.save();
    return;
  }

  const snapshot = contract.fieldsSnapshot as Snapshot;
  snapshot.purchase = {
    ...snapshot.purchase,
    status: "paid",
  };
  contract.fieldsSnapshot = snapshot;
  await contract.save();

  const lines = buildContractLines(snapshot);
  const pdf = buildSimplePdf(lines);
  const year = new Date(snapshot.signatures.signedAt || new Date().toISOString()).getUTCFullYear();
  const key = `pos/contracts/${year}/tx-${safeS3Segment(tx._id.toString())}.pdf`;
  const uploaded = await uploadToS3(key, pdf, "application/pdf", `contract-${tx._id.toString()}.pdf`);
  const pdfUrl = resolvePdfUrl(key, uploaded.url);

  await POSTransactionModel.updateOne(
    { _id: tx._id },
    {
      $set: {
        "contract.contractId": contract._id,
        "contract.pdfUrl": pdfUrl,
      },
    },
  );

  await appendPosAuditLog({
    actorAdminId: adminId,
    action: "SIGN_CONTRACT",
    txId: tx._id,
    payload: {
      contractId: contract._id.toString(),
      pdfUrl,
      signedAt: snapshot.signatures.signedAt,
    },
  });
}
