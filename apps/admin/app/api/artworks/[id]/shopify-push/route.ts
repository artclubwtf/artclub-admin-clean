import { NextResponse } from "next/server";

const message = "Artwork push is disabled. Artworks must be managed directly in Shopify.";

export async function POST() {
  return NextResponse.json({ error: message }, { status: 410 });
}
