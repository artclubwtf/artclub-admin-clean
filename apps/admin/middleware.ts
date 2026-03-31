import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function redirectToLogin(req: NextRequest) {
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(loginUrl);
}

function redirectToArtistsLogin(req: NextRequest) {
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
  const loginUrl = new URL("/artists/login", req.url);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(loginUrl);
}

function isEnabled(rawValue: string | undefined, fallback = false) {
  const raw = (rawValue || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApiPath = pathname.startsWith("/api");
  const isAdminPath = pathname.startsWith("/admin");
  const isArtistPath = pathname === "/artist" || pathname.startsWith("/artist/");
  const isArtistsPath = pathname === "/artists" || pathname.startsWith("/artists/");

  if (isApiPath) {
    const allowedApi =
      pathname.startsWith("/api/auth") ||
      pathname === "/api/setup" ||
      pathname.startsWith("/api/setup/") ||
      pathname === "/api/admin/pos" ||
      pathname.startsWith("/api/admin/pos/") ||
      pathname === "/api/account/change-password" ||
      pathname.startsWith("/api/account/change-password/") ||
      pathname.startsWith("/api/applications") ||
      pathname.startsWith("/api/mobile") ||
      pathname.startsWith("/api/pos-agent") ||
      pathname.startsWith("/api/webhooks/verifone") ||
      pathname === "/api/artists/v2/register" ||
      pathname === "/api/artists/v3/register" ||
      pathname === "/api/shopify/files/upload" ||
      pathname === "/api/shopify/files/resolve" ||
      pathname === "/api/shopify/resolve-media" ||
      pathname.startsWith("/api/artist-onboarding");

    if (allowedApi) return NextResponse.next();

    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (pathname.startsWith("/api/uploads")) {
        if (token.role === "team" || token.role === "artist") {
          return NextResponse.next();
        }
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const isArtistApi = pathname === "/api/artist" || pathname.startsWith("/api/artist/");
      if (isArtistApi) {
        if (token.role !== "artist" || !token.artistId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.next();
      }

      const isArtistsV2Api = pathname.startsWith("/api/artists/v2/");
      if (isArtistsV2Api) {
        if (token.role !== "artist") {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.next();
      }

      const isArtistsV3Api = pathname.startsWith("/api/artists/v3/");
      if (isArtistsV3Api) {
        if (token.role !== "artist") {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.next();
      }

      if (token.role !== "team") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.next();
    } catch (err) {
      console.error("Middleware auth error (api)", err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (isArtistPath || isArtistsPath) {
    return NextResponse.next();
  }

  if (!isAdminPath) return NextResponse.next();

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return redirectToLogin(req);
    }

    if (isAdminPath) {
      if (token.role !== "team") {
        const fallback = token.role === "artist" ? "/artists" : "/login";
        return NextResponse.redirect(new URL(fallback, req.url));
      }
      return NextResponse.next();
    }
  } catch (err) {
    console.error("Middleware auth error", err);
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/artist/:path*", "/artists/:path*", "/api/:path*"],
};
