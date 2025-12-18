import { NextResponse } from "next/server";
import { fetchKuenstler } from "@/lib/shopify";

export async function GET() {
  try {
    const metaobjects = await fetchKuenstler(100);
    const artists = metaobjects.map((m) => ({
      metaobjectId: m.id,
      handle: m.handle,
      displayName: m.name || m.handle,
      instagram: m.instagram,
      bilder: m.bilder,
      bild_1: m.bild_1,
      bild_2: m.bild_2,
      bild_3: m.bild_3,
      quote: m.quote,
      einleitung_1: m.einleitung_1,
      text_1: m.text_1,
      kategorie: m.kategorie,
    }));

    return NextResponse.json({ artists }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch Shopify artists", err);
    return NextResponse.json({ error: "Failed to fetch Shopify artists" }, { status: 500 });
  }
}
