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

  if (!pathname.startsWith("/admin") && !pathname.startsWith("/artist")) {
    return NextResponse.next();
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return redirectToLogin(req);

    if (pathname.startsWith("/admin")) {
      if (token.role !== "team") {
        const fallback = token.role === "artist" ? "/artist" : "/login";
        return NextResponse.redirect(new URL(fallback, req.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith("/artist")) {
      if (token.role !== "artist") {
        const fallback = token.role === "team" ? "/admin" : "/login";
        return NextResponse.redirect(new URL(fallback, req.url));
      }

      if (token.mustChangePassword && !pathname.startsWith("/artist/change-password")) {
        const changeUrl = new URL("/artist/change-password", req.url);
        changeUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
        return NextResponse.redirect(changeUrl);
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
  matcher: ["/admin/:path*", "/artist/:path*"],
};
