import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artistId = session.user.artistId;
  if (!artistId || !Types.ObjectId.isValid(artistId)) {
    return NextResponse.json({ error: "Artist account not linked" }, { status: 404 });
  }

  await connectMongo();
  const artist = await ArtistModel.findById(artistId)
    .select({
      name: 1,
      stage: 1,
      publicProfile: 1,
      shopifySync: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean();

  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      id: artist._id.toString(),
      name: artist.name,
      stage: artist.stage,
      heroImageUrl: artist.publicProfile?.heroImageUrl,
      shopifyMetaobjectId: artist.shopifySync?.metaobjectId,
      createdAt: artist.createdAt,
      updatedAt: artist.updatedAt,
    },
    { status: 200 },
  );
}
