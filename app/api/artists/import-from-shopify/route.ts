import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { fetchKuenstlerById } from "@/lib/shopify";

type ImportRequest = {
  metaobjectId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImportRequest;
    const metaobjectId = typeof body?.metaobjectId === "string" ? body.metaobjectId.trim() : "";
    if (!metaobjectId) {
      return NextResponse.json({ error: "metaobjectId is required" }, { status: 400 });
    }

    const metaobject = await fetchKuenstlerById(metaobjectId);
    if (!metaobject) {
      return NextResponse.json({ error: "Shopify artist not found" }, { status: 404 });
    }

    await connectMongo();

    const existing = await ArtistModel.findOne({ "shopifySync.metaobjectId": metaobject.id }).lean();
    if (existing) {
      return NextResponse.json({ error: "Artist already imported" }, { status: 400 });
    }

    const displayName = metaobject.name?.trim() || metaobject.handle || "Shopify Artist";
    const publicProfile = {
      name: metaobject.name || undefined,
      displayName: metaobject.name || undefined,
      instagram: metaobject.instagram || undefined,
      quote: metaobject.quote || undefined,
      einleitung_1: metaobject.einleitung_1 || undefined,
      text_1: metaobject.text_1 || undefined,
      kategorie: metaobject.kategorie || undefined,
      bilder: metaobject.bilder || undefined,
      bild_1: metaobject.bild_1 || undefined,
      bild_2: metaobject.bild_2 || undefined,
      bild_3: metaobject.bild_3 || undefined,
    };

    const created = await ArtistModel.create({
      name: displayName,
      stage: "Under Contract",
      publicProfile,
      shopifySync: {
        metaobjectId: metaobject.id,
        handle: metaobject.handle,
        lastSyncStatus: "idle",
      },
    });

    return NextResponse.json({ artist: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to import artist from Shopify", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
