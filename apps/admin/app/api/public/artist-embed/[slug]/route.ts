import { NextResponse } from "next/server";

import { buildPublicCorsHeaders } from "@/lib/publicCors";
import { loadPublicArtistEmbed } from "@/lib/publicArtistEmbed";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildPublicCorsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = {
    ...buildPublicCorsHeaders(req.headers.get("origin")),
    "Cache-Control": "no-store",
  };

  try {
    const payload = await loadPublicArtistEmbed(slug, req.url);
    if (!payload) {
      return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404, headers });
    }

    return NextResponse.json(payload, { status: 200, headers });
  } catch (error) {
    console.error("Failed to load public artist embed", error);
    return NextResponse.json({ ok: false, error: "artist_embed_failed" }, { status: 500, headers });
  }
}
