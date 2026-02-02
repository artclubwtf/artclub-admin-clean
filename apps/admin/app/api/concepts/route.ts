import { NextRequest, NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";
import { brandKeys } from "@/models/BrandSettings";
import {
  badRequest,
  parseAssets,
  parseGranularity,
  parseReferences,
  parseSections,
  parseStatus,
  parseString,
  parseType,
} from "./utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;
    const brandKey = searchParams.get("brandKey") || undefined;
    const q = searchParams.get("q")?.trim();

    const filter: Record<string, unknown> = {};
    if (status) {
      const parsedStatus = parseStatus(status);
      if (!parsedStatus) return badRequest("Invalid status");
      filter.status = parsedStatus;
    }
    if (type) {
      const parsedType = parseType(type);
      if (!parsedType) return badRequest("Invalid type");
      filter.type = parsedType;
    }
    if (brandKey) {
      const normalized = brandKeys.includes(brandKey as (typeof brandKeys)[number]) ? brandKey : null;
      if (!normalized) return badRequest("Invalid brandKey");
      filter.brandKey = normalized;
    }
    if (q) {
      filter.title = { $regex: q, $options: "i" };
    }

    await connectMongo();
    const concepts = await ConceptModel.find(filter).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ concepts }, { status: 200 });
  } catch (err) {
    console.error("Failed to list concepts", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") {
      return badRequest("Invalid JSON body");
    }

    const title = parseString(json.title);
    const brandKey =
      typeof json.brandKey === "string" && brandKeys.includes(json.brandKey as (typeof brandKeys)[number])
        ? (json.brandKey as (typeof brandKeys)[number])
        : null;
    const type = parseType(json.type);
    const granularity = parseGranularity(json.granularity);

    if (!title || !brandKey || !type || !granularity) {
      return badRequest("title, brandKey, type, and granularity are required");
    }

    const sections = parseSections(json.sections) || {};
    const references = parseReferences(json.references) || {};
    const assets = parseAssets(json.assets) || [];
    const notes = parseString(json.notes);

    await connectMongo();
    const created = await ConceptModel.create({
      title,
      brandKey,
      type,
      granularity,
      status: "draft",
      sections,
      references,
      assets,
      notes,
    });

    return NextResponse.json({ concept: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create concept", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
