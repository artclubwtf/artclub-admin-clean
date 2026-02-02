import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel, artistStages, updateArtistSchema } from "@/models/Artist";

function invalidIdResponse() {
  return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return invalidIdResponse();

    await connectMongo();
    const artist = await ArtistModel.findById(id).lean();
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    return NextResponse.json({ artist }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return invalidIdResponse();

    const json = await req.json();
    const parsed = updateArtistSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.stage === "Under Contract") {
      const profile = parsed.data.publicProfile || {};
      const name = profile.name?.trim() || profile.displayName?.trim();
      const text1 = profile.text_1?.trim() || profile.bio?.trim();
      const errors: Record<string, string[]> = {};
      if (!name) errors["publicProfile.name"] = ["Name is required for Under Contract"];
      if (!text1) errors["publicProfile.text_1"] = ["text_1 is required for Under Contract"];
      if (Object.keys(errors).length > 0) {
        return NextResponse.json({ error: { fieldErrors: errors } }, { status: 400 });
      }
    }

    await connectMongo();
    const updated = await ArtistModel.findByIdAndUpdate(id, parsed.data, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

    return NextResponse.json({ artist: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return invalidIdResponse();

    await connectMongo();
    const deleted = await ArtistModel.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    return NextResponse.json({ artist: deleted }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
