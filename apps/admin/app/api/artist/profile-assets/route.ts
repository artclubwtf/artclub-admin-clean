import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { upsertArtistMetaobject } from "@/lib/shopify";
import { ArtistModel } from "@/models/Artist";

const assetSchema = z.object({
  key: z.enum(["bilder", "bild_1", "bild_2", "bild_3"]),
  fileId: z.string().trim().min(1, "fileId is required"),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artistId = session.user.artistId;
  if (!artistId || !Types.ObjectId.isValid(artistId)) {
    return NextResponse.json({ error: "Artist not linked" }, { status: 400 });
  }

  const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = assetSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await connectMongo();
  const artist = await ArtistModel.findById(artistId);
  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  const { key, fileId } = parsed.data;
  artist.publicProfile = {
    ...(artist.publicProfile || {}),
    [key]: fileId,
  };

  if (!artist.shopifySync?.metaobjectId) {
    await artist.save();
    return NextResponse.json(
      {
        ok: true,
        asset: { key, fileId },
        platformSync: { status: "pending" },
      },
      { status: 200 },
    );
  }

  try {
    const fallbackHandle =
      artist.shopifySync?.handle ||
      artist.publicProfile?.displayName ||
      artist.publicProfile?.name ||
      artist.name ||
      "artist";

    const result = await upsertArtistMetaobject({
      metaobjectId: artist.shopifySync.metaobjectId,
      handle: fallbackHandle,
      fields: { [key]: fileId },
    });

    artist.shopifySync = {
      ...artist.shopifySync,
      metaobjectId: result.id || artist.shopifySync.metaobjectId,
      handle: result.handle || artist.shopifySync.handle,
      lastSyncedAt: new Date(),
      lastSyncStatus: "ok",
      lastSyncError: undefined,
    };

    await artist.save();
    return NextResponse.json(
      {
        ok: true,
        asset: { key, fileId },
        platformSync: { status: "ok", lastSyncedAt: artist.shopifySync.lastSyncedAt },
      },
      { status: 200 },
    );
  } catch (err: any) {
    artist.shopifySync = {
      ...artist.shopifySync,
      lastSyncStatus: "error",
      lastSyncError: err?.message || "Platform sync failed",
    };
    await artist.save();
    return NextResponse.json({ error: "Platform sync failed" }, { status: 500 });
  }
}
