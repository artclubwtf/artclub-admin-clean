import { NextRequest, NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";
import { ConceptSnapshotModel } from "@/models/ConceptSnapshot";
import { buildSnapshotPayload, isValidObjectId, notFound } from "../../utils";

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
    const concept = await ConceptModel.findById(id).select({ _id: 1 }).lean();
    if (!concept) return notFound("Concept not found");

    const snapshots = await ConceptSnapshotModel.find({ conceptId: id }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ snapshots }, { status: 200 });
  } catch (err) {
    console.error("Failed to list concept snapshots", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const id = await resolveId(context);
    if (!isValidObjectId(id)) return notFound("Concept not found");

    await connectMongo();
    const concept = await ConceptModel.findById(id);
    if (!concept) return notFound("Concept not found");

    const snapshot = await ConceptSnapshotModel.create({
      conceptId: concept._id,
      status: concept.status,
      title: concept.title,
      payload: buildSnapshotPayload(concept.toObject()),
    });

    return NextResponse.json({ snapshot: snapshot.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create concept snapshot", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
