import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { GET as authMeGET } from "@/app/api/auth/me/route";
import { POST as authLoginPOST } from "@/app/api/auth/login/route";
import { POST as authLogoutPOST } from "@/app/api/auth/logout/route";
import { POST as authRegisterPOST } from "@/app/api/auth/register/route";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function buildMessage(params: URLSearchParams) {
  const entries = Array.from(params.entries()).filter(([key]) => key !== "signature");
  entries.sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) return aValue.localeCompare(bValue);
    return aKey.localeCompare(bKey);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

function signaturesMatch(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function verifyProxySignature(url: URL) {
  const signature = url.searchParams.get("signature");
  if (!signature) return false;
  const secret = mustEnv("SHOPIFY_API_SECRET");
  const message = buildMessage(url.searchParams);
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return signaturesMatch(digest, signature.toLowerCase());
}

function withProxyHeaders(res: Response) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Cookie");
  return res;
}

type ProxyParams = { path?: string[] };

export async function GET(req: Request, { params }: { params: ProxyParams }) {
  try {
    const url = new URL(req.url);
    if (!verifyProxySignature(url)) {
      return withProxyHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const path = `/${(params.path || []).join("/")}`;
    if (path === "/session") {
      const res = await authMeGET(req);
      return withProxyHeaders(res);
    }

    return withProxyHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  } catch (err) {
    console.error("Proxy GET failed", err);
    return withProxyHeaders(NextResponse.json({ error: "Internal Server Error" }, { status: 500 }));
  }
}

export async function POST(req: Request, { params }: { params: ProxyParams }) {
  try {
    const url = new URL(req.url);
    if (!verifyProxySignature(url)) {
      return withProxyHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const path = `/${(params.path || []).join("/")}`;
    if (path === "/login") {
      const res = await authLoginPOST(req);
      return withProxyHeaders(res);
    }
    if (path === "/register") {
      const res = await authRegisterPOST(req);
      return withProxyHeaders(res);
    }
    if (path === "/logout") {
      const res = await authLogoutPOST(req);
      return withProxyHeaders(res);
    }

    return withProxyHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }));
  } catch (err) {
    console.error("Proxy POST failed", err);
    return withProxyHeaders(NextResponse.json({ error: "Internal Server Error" }, { status: 500 }));
  }
}
