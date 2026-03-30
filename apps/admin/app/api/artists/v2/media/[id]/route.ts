import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { ArtistMediaV2Model } from "@/models/ArtistMediaV2";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_media_id" }, { status: 400 });
  }

  const deleted = await ArtistMediaV2Model.findOneAndDelete({
    _id: id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  }).lean();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "media_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
