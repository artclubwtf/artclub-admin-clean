import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { buildArtistMetaobjectFieldsFromForm, upsertArtistMetaobject } from "@/lib/shopify";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
    }

    await connectMongo();
    const artist = await ArtistModel.findById(id);
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

    const profile = artist.publicProfile || {};
    const name = profile.name?.trim() || profile.displayName?.trim();
    const text1 = profile.text_1?.trim() || profile.bio?.trim();
    if (!name || !text1) {
      return NextResponse.json(
        { error: { fieldErrors: { publicProfile: ["name and text_1 are required for sync"] } } },
        { status: 400 },
      );
    }

    const fields = {
      name,
      instagram: profile.instagram?.trim() || null,
      quote: profile.quote?.trim() || null,
      einleitung_1: profile.einleitung_1?.trim() || null,
      text_1: text1,
      kategorie: profile.kategorie?.trim() || null,
      bilder: profile.bilder?.trim() || null,
      bild_1: profile.bild_1?.trim() || null,
      bild_2: profile.bild_2?.trim() || null,
      bild_3: profile.bild_3?.trim() || null,
    };

    const metaobjectFields = buildArtistMetaobjectFieldsFromForm(fields);
    if (metaobjectFields.length === 0) {
      return NextResponse.json({ error: "No Shopify fields to sync" }, { status: 400 });
    }

    const result = await upsertArtistMetaobject({
      metaobjectId: artist.shopifySync?.metaobjectId || undefined,
      handle: artist.shopifySync?.handle || undefined,
      fields,
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
