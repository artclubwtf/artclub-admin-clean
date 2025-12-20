import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artistId = session.user.artistId;
  if (!artistId || !Types.ObjectId.isValid(artistId)) {
    return NextResponse.json({ error: "Artist not linked" }, { status: 400 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid media id" }, { status: 400 });
  }

  await connectMongo();
  const deleted = await MediaModel.findOneAndDelete({ _id: id, artistId }).lean();
  if (!deleted) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
