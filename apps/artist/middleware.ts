import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPublicCorsHeaders } from "@/lib/publicCors";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublicEmbedAsset = pathname === "/artist-embed.js" || pathname === "/artist-embed.css";
  const isPublicEmbedApi = pathname.startsWith("/api/public/artist-embed/");

  if (!isPublicEmbedAsset && !isPublicEmbedApi) {
    return NextResponse.next();
  }

  const headers = buildPublicCorsHeaders(req.headers.get("origin"));
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
  matcher: ["/artist-embed.js", "/artist-embed.css", "/api/public/artist-embed/:path*"],
};
