import { NextRequest, NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";
import {
  badRequest,
  isValidObjectId,
  notFound,
  parseAssets,
  parseExports,
  parseGranularity,
  parseReferences,
  parseSections,
  parseString,
} from "../utils";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveId(context: RouteContext) {
  const params = await context.params;
  return params.id;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const id = await resolveId(context);
    if (!isValidObjectId(id)) return notFound("Concept not found");

    await connectMongo();
    const concept = await ConceptModel.findById(id).lean();
    if (!concept) return notFound("Concept not found");

    return NextResponse.json({ concept }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch concept", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const id = await resolveId(context);
    if (!isValidObjectId(id)) return notFound("Concept not found");

    const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") {
      return badRequest("Invalid JSON body");
    }

    if ("status" in json) {
      return badRequest("status must be updated via /status");
    }

    const update: Record<string, unknown> = {};
    const title = parseString(json.title);
    if (title) update.title = title;

    const granularity = parseGranularity(json.granularity);
    if (granularity) update.granularity = granularity;
    if (json.granularity && !granularity) return badRequest("Invalid granularity");

    if ("sections" in json) {
      const sections = parseSections(json.sections);
      if (sections) {
        update.sections = sections;
      } else {
        update.sections = {};
      }
    }

    if ("references" in json) {
      const references = parseReferences(json.references);
      if (references) {
        update.references = references;
      } else {
        update.references = {};
      }
    }

    if ("assets" in json) {
      const assets = parseAssets(json.assets);
      if (assets) {
        update.assets = assets;
      } else {
        update.assets = [];
      }
    }

    if ("notes" in json) {
      update.notes = parseString(json.notes) || "";
    }

    if ("exports" in json) {
      const exportsData = parseExports(json.exports);
      if (exportsData) {
        update.exports = exportsData;
      }
    }

    if (Object.keys(update).length === 0) {
      return badRequest("No updatable fields provided");
    }

    await connectMongo();
    const concept = await ConceptModel.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!concept) return notFound("Concept not found");

    return NextResponse.json({ concept }, { status: 200 });
  } catch (err) {
    console.error("Failed to update concept", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const id = await resolveId(context);
    if (!isValidObjectId(id)) return notFound("Concept not found");

    await connectMongo();
    const deleted = await ConceptModel.findByIdAndDelete(id).lean();
    if (!deleted) return notFound("Concept not found");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete concept", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
