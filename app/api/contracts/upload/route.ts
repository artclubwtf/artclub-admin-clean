import { NextResponse } from "next/server";
import { uploadToS3 } from "@/lib/s3";
import { connectMongo } from "@/lib/mongodb";
import { ContractModel, contractTypes } from "@/models/Contract";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function sanitizeFilename(name: string) {
  const trimmed = name.trim() || "upload";
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  const withoutExt = base.replace(/\.pdf$/i, "");
  return `${withoutExt || "upload"}.pdf`;
}

function parseDate(value: string | null) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const kunstlerId = form.get("kunstlerId");
    const contractTypeRaw = form.get("contractType");
    const signedAtRaw = form.get("signedAt");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }
    if (typeof kunstlerId !== "string" || !kunstlerId.trim()) {
      return NextResponse.json({ error: "kunstlerId is required" }, { status: 400 });
    }

    const contractType = typeof contractTypeRaw === "string" && contractTypes.includes(contractTypeRaw as any)
      ? (contractTypeRaw as (typeof contractTypes)[number])
      : "artist_contract";
    const signedAt = parseDate(typeof signedAtRaw === "string" ? signedAtRaw : null);

    const filename = sanitizeFilename(typeof file.name === "string" ? file.name : "upload.pdf");
    const timestamp = Date.now();
    const key = `contracts/${encodeURIComponent(kunstlerId.trim())}/${timestamp}-${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/pdf";

    await uploadToS3(key, buffer, contentType);

    const s3PublicBase = process.env.S3_PUBLIC_BASE_URL;
    const s3Url = s3PublicBase ? `${s3PublicBase.replace(/\/$/, "")}/${key}` : undefined;

    await connectMongo();
    const doc = await ContractModel.create({
      kunstlerId: kunstlerId.trim(),
      contractType,
      filename,
      s3Key: key,
      s3Url,
      mimeType: contentType,
      sizeBytes: file.size,
      signedAt,
    });

    return NextResponse.json({ contract: doc.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to upload contract", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
