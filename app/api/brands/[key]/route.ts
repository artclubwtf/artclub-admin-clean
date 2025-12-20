import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { BrandSettingsModel } from "@/models/BrandSettings";
import { BrandPayload, extractBrandUpdate, normalizeBrandKey } from "../utils";

type RouteParams = {
  params: { key: string };
};

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const key = normalizeBrandKey(params.key);
    if (!key) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    await connectMongo();
    const brand = await BrandSettingsModel.findOne({ key }).lean();
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ brand }, { status: 200 });
  } catch (err) {
    console.error("Failed to get brand settings", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const key = normalizeBrandKey(params.key);
    if (!key) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const json = (await req.json().catch(() => null)) as BrandPayload | null;
    if (!json || typeof json !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const update = extractBrandUpdate(json);
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    await connectMongo();
    const brand = await BrandSettingsModel.findOneAndUpdate({ key }, { $set: update }, { new: true }).lean();
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ brand }, { status: 200 });
  } catch (err) {
    console.error("Failed to update brand settings", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
