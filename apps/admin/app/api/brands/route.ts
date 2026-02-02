import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { BrandSettingsModel } from "@/models/BrandSettings";
import { BrandPayload, defaultBrandSeeds, extractBrandUpdate, normalizeBrandKey } from "./utils";

async function ensureSeededBrands() {
  const existingCount = await BrandSettingsModel.countDocuments();
  if (existingCount > 0) return;

  try {
    await BrandSettingsModel.insertMany(defaultBrandSeeds);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
      return;
    }
    throw err;
  }
}

export async function GET() {
  try {
    await connectMongo();
    await ensureSeededBrands();
    const brands = await BrandSettingsModel.find().sort({ key: 1 }).lean();
    return NextResponse.json({ brands }, { status: 200 });
  } catch (err) {
    console.error("Failed to list brand settings", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = (await req.json().catch(() => null)) as BrandPayload | null;
    if (!json || typeof json !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const key = normalizeBrandKey(json.key);
    if (!key) {
      return NextResponse.json({ error: "key must be one of: artclub, alea" }, { status: 400 });
    }

    const update = extractBrandUpdate(json);
    if (!update.displayName || !update.tone || !update.about) {
      return NextResponse.json(
        { error: "displayName, tone, and about are required to upsert a brand" },
        { status: 400 },
      );
    }

    await connectMongo();
    const brand = await BrandSettingsModel.findOneAndUpdate(
      { key },
      { $set: { ...update, key } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({ brand }, { status: 200 });
  } catch (err) {
    console.error("Failed to upsert brand settings", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
