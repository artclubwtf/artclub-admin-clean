import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPublicCorsHeaders } from "@/lib/publicCors";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublicArtistPage = pathname.startsWith("/artist/");
  const isPublicEmbedAsset = pathname === "/artist-embed.js" || pathname === "/artist-embed.css";
  const headers = buildPublicCorsHeaders(req.headers.get("origin"));

  if (!isPublicArtistPage && !isPublicEmbedAsset) {
    return NextResponse.next();
  }

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/artist/:path*", "/artist-embed.js", "/artist-embed.css"],
};
