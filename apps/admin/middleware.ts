import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function redirectToLogin(req: NextRequest) {
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(loginUrl);
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

      if (token.role !== "team") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.next();
    } catch (err) {
      console.error("Middleware auth error (api)", err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isAdminPath && !isArtistPath && !isArtistsPath) return NextResponse.next();

  try {
    const isPublicArtistsEntry =
      pathname === "/artists" ||
      pathname === "/artists/" ||
      pathname === "/artists/register" ||
      pathname === "/artists/register/" ||
      pathname === "/artists/login" ||
      pathname === "/artists/login/";

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (isArtistsPath && isPublicArtistsEntry && !token) {
      return NextResponse.next();
    }
    if (!token && (pathname === "/artist" || pathname === "/artist/")) {
      return NextResponse.redirect(new URL("/artists", req.url));
    }
    if (!token) return redirectToLogin(req);

    if (isAdminPath) {
      if (token.role !== "team") {
        const fallback = token.role === "artist" ? "/artist" : "/login";
        return NextResponse.redirect(new URL(fallback, req.url));
      }
      return NextResponse.next();
    }

    if (isArtistPath) {
      if (token.role !== "artist") {
        const fallback = token.role === "team" ? "/admin" : "/login";
        return NextResponse.redirect(new URL(fallback, req.url));
      }

      const artistKey = (token as { artistKey?: string }).artistKey;
      const onboardingComplete = (token as { onboardingComplete?: boolean }).onboardingComplete === true;
      if (!token.artistId && artistKey) {
        if (token.mustChangePassword) {
          if (!pathname.startsWith("/artist/change-password")) {
            const changeUrl = new URL("/artist/change-password", req.url);
            changeUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
            return NextResponse.redirect(changeUrl);
          }
          return NextResponse.next();
        }

        const target = onboardingComplete ? "/artists" : "/artists/onboarding";
        return NextResponse.redirect(new URL(target, req.url));
      }

      const pendingRegistrationId = (token as { pendingRegistrationId?: string }).pendingRegistrationId;
      if (!token.artistId && pendingRegistrationId) {
        return NextResponse.redirect(new URL(`/apply/${pendingRegistrationId}/dashboard`, req.url));
      }

      if (token.mustChangePassword && !pathname.startsWith("/artist/change-password")) {
        const changeUrl = new URL("/artist/change-password", req.url);
        changeUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
        return NextResponse.redirect(changeUrl);
      }

      return NextResponse.next();
    }

    if (isArtistsPath) {
      if (isPublicArtistsEntry) {
        const onboardingComplete = (token as { onboardingComplete?: boolean }).onboardingComplete === true;
        if (token.role === "artist" && pathname === "/artists" && !onboardingComplete) {
          return NextResponse.redirect(new URL("/artists/onboarding", req.url));
        }
        return NextResponse.next();
      }

      if (token.role !== "artist") {
        const fallback = token.role === "team" ? "/admin" : "/login";
        return NextResponse.redirect(new URL(fallback, req.url));
      }

      const artistKey = (token as { artistKey?: string }).artistKey;
      const onboardingComplete = (token as { onboardingComplete?: boolean }).onboardingComplete === true;
      if (!artistKey) {
        return NextResponse.redirect(new URL("/artist", req.url));
      }

      if (token.mustChangePassword && !pathname.startsWith("/artist/change-password")) {
        const changeUrl = new URL("/artist/change-password", req.url);
        changeUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
        return NextResponse.redirect(changeUrl);
      }

      if (!onboardingComplete && !pathname.startsWith("/artists/onboarding")) {
        return NextResponse.redirect(new URL("/artists/onboarding", req.url));
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
