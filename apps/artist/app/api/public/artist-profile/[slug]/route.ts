import { NextResponse } from "next/server";

import { buildPublicCorsHeaders } from "@/lib/publicCors";
import { loadPublicArtistPageBySlug } from "@/lib/server/public-artist-page";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildPublicCorsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = buildPublicCorsHeaders(req.headers.get("origin"));

  const profile = await loadPublicArtistPageBySlug(slug);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404, headers });
  }

  return NextResponse.json(profile, {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
