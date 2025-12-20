import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { uploadToS3 } from "@/lib/s3";
import { BrandSettingsModel } from "@/models/BrandSettings";
import { normalizeBrandKey } from "../../utils";

type RouteParams = {
  params: { key: string };
};

const MAX_LOGO_SIZE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;
const mimeToExtension: Record<(typeof allowedMimeTypes)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

function resolveMimeType(file: File) {
  if (allowedMimeTypes.includes(file.type as (typeof allowedMimeTypes)[number])) {
    return file.type as (typeof allowedMimeTypes)[number];
  }
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}

function inferExtension(file: File, mimeType: (typeof allowedMimeTypes)[number]) {
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const extFromName = Object.values(mimeToExtension).find((ext) => name.endsWith(`.${ext}`));
  return extFromName || mimeToExtension[mimeType] || "file";
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const key = normalizeBrandKey(params.key);
    if (!key) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const variantRaw = form.get("variant");
    const variant = typeof variantRaw === "string" && (variantRaw === "light" || variantRaw === "dark") ? variantRaw : null;

    if (!variant) {
      return NextResponse.json({ error: "variant must be 'light' or 'dark'" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const mimeType = resolveMimeType(file);
    if (!mimeType) {
      return NextResponse.json({ error: "Only png, jpg, svg, or webp files are allowed" }, { status: 400 });
    }

    await connectMongo();
    const brand = await BrandSettingsModel.findOne({ key });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const extension = inferExtension(file, mimeType);
    const s3Key = `brands/${key}/logo-${variant}-${Date.now()}.${extension}`;
    const uploaded = await uploadToS3(s3Key, fileBuffer, mimeType, typeof file.name === "string" ? file.name : undefined);

    if (!uploaded.url) {
      return NextResponse.json({ error: "Failed to resolve upload URL" }, { status: 500 });
    }

    const updateField = variant === "light" ? { logoLightUrl: uploaded.url } : { logoDarkUrl: uploaded.url };
    await BrandSettingsModel.updateOne({ _id: brand._id }, { $set: updateField });

    return NextResponse.json({ ok: true, url: uploaded.url }, { status: 201 });
  } catch (err) {
    console.error("Failed to upload brand logo", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
