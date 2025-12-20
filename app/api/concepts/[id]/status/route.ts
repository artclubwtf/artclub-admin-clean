import { NextRequest, NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";
import { ConceptSnapshotModel } from "@/models/ConceptSnapshot";
import type { Concept } from "@/models/Concept";
import { badRequest, buildSnapshotPayload, isValidObjectId, notFound, parseStatus } from "../../utils";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveId(context: RouteContext) {
  const params = await context.params;
  return params.id;
}

type ConceptForSnapshot = {
  _id: unknown;
} & Pick<Concept, "status" | "title" | "brandKey" | "type" | "granularity" | "sections" | "references" | "assets" | "exports">;

async function createSnapshot(concept: ConceptForSnapshot) {
  return ConceptSnapshotModel.create({
    conceptId: concept._id,
    status: concept.status,
    title: concept.title,
    payload: buildSnapshotPayload(concept),
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const id = await resolveId(context);
    if (!isValidObjectId(id)) return notFound("Concept not found");

    const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") {
      return badRequest("Invalid JSON body");
    }

    const status = parseStatus(json.status);
    if (!status) return badRequest("Invalid status");

    const nowIso = new Date().toISOString();

    await connectMongo();
    const concept = await ConceptModel.findByIdAndUpdate(
      id,
      { $set: { status, [`statusChangedAt.${status}`]: nowIso } },
      { new: true },
    );
    if (!concept) return notFound("Concept not found");

    const snapshot = await createSnapshot(concept.toObject());

    return NextResponse.json({ concept: concept.toObject(), snapshot: snapshot.toObject() }, { status: 200 });
  } catch (err) {
    console.error("Failed to update concept status", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
