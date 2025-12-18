import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { upsertArtistMetaobject } from "@/lib/shopify";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
    }

    await connectMongo();
    const artist = await ArtistModel.findById(id);
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

    const displayName = artist.publicProfile?.displayName?.trim();
    const bio = artist.publicProfile?.bio?.trim();
    if (!displayName || !bio) {
      return NextResponse.json(
        { error: { fieldErrors: { publicProfile: ["displayName and bio required for sync"] } } },
        { status: 400 },
      );
    }

    const result = await upsertArtistMetaobject({
      metaobjectId: artist.shopifySync?.metaobjectId || undefined,
      handle: artist.shopifySync?.handle || undefined,
      displayName,
      bio,
      instagram: artist.publicProfile?.instagram || undefined,
      website: artist.publicProfile?.website || undefined,
      location: artist.publicProfile?.location || undefined,
      heroImageUrl: artist.publicProfile?.heroImageUrl || undefined,
      internalStage: artist.stage,
    });

    artist.shopifySync = {
      ...artist.shopifySync,
      metaobjectId: result.id,
      handle: result.handle,
      lastSyncedAt: new Date(),
      lastSyncStatus: "ok",
      lastSyncError: undefined,
    };
    await artist.save();

    return NextResponse.json({ shopifySync: artist.shopifySync }, { status: 200 });
  } catch (err: any) {
    console.error("Failed to sync artist to Shopify", err);
    return NextResponse.json({ error: err?.message || "Failed to sync" }, { status: 500 });
  }
}
