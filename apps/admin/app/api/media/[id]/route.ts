import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid media id" }, { status: 400 });

    await connectMongo();
    const deleted = await MediaModel.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ error: "Media not found" }, { status: 404 });

    // Optional: delete from S3 could be added here.
    return NextResponse.json({ media: deleted }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete media", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
