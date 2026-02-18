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
      publicProfile: {
        name: artist.publicProfile?.name,
        displayName: artist.publicProfile?.displayName,
        quote: artist.publicProfile?.quote,
        einleitung_1: artist.publicProfile?.einleitung_1,
        text_1: artist.publicProfile?.text_1,
        bio: artist.publicProfile?.bio,
        instagram: artist.publicProfile?.instagram,
        website: artist.publicProfile?.website,
        location: artist.publicProfile?.location,
        bilder: artist.publicProfile?.bilder,
        bild_1: artist.publicProfile?.bild_1,
        bild_2: artist.publicProfile?.bild_2,
        bild_3: artist.publicProfile?.bild_3,
      },
      shopifyMetaobjectId: artist.shopifySync?.metaobjectId,
      platformSync: {
        status: artist.shopifySync?.lastSyncStatus,
        lastSyncedAt: artist.shopifySync?.lastSyncedAt,
        lastError: artist.shopifySync?.lastSyncError,
      },
      createdAt: artist.createdAt,
      updatedAt: artist.updatedAt,
    },
    { status: 200 },
  );
}
