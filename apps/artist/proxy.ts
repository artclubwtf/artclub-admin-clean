import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPublicCorsHeaders } from "@/lib/publicCors";

function getArtistSlugFromPath(pathname: string) {
  const match = pathname.match(/^\/artist\/([^/?#]+)/i);
  return match?.[1] || "";
}

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const isPublicEmbedAsset = pathname === "/artist-embed.js" || pathname === "/artist-embed.css";
  const isPublicEmbedApi = pathname.startsWith("/api/public/artist-embed/");
  const isEmbedPageRequest = pathname.startsWith("/artist/") && searchParams.get("embed") === "1";
  const headers = buildPublicCorsHeaders(req.headers.get("origin"));

  if (isEmbedPageRequest) {
    const slug = getArtistSlugFromPath(pathname);
    if (!slug) {
      return new NextResponse('<div class="text-sm text-neutral-400">Artist not found.</div>', {
        status: 404,
        headers: {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers });
    }

    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = `/api/public/artist-embed/${encodeURIComponent(slug)}/html`;
    rewriteUrl.search = "";

    const response = NextResponse.rewrite(rewriteUrl);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  }

  if (!isPublicEmbedAsset && !isPublicEmbedApi) {
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
  matcher: ["/artist/:path*", "/artist-embed.js", "/artist-embed.css", "/api/public/artist-embed/:path*"],
};
