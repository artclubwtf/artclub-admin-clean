import { NextResponse, type NextRequest } from "next/server";

import { customerLoginSchema, customerRegisterSchema } from "@/lib/authSchemas";
import { getCustomerUserBySessionToken, loginCustomer, registerCustomer } from "@/lib/customerAuth";
import { deleteCustomerSession } from "@/lib/customerSessions";
import {
  buildShopifyProxySignatureMessage,
  compareShopifyProxySignatures,
  computeShopifyProxySignatureFromMessage,
  getShopifyProxyProvidedSignature,
} from "@/lib/shopifyProxySignature.mjs";

type ProxyVerifyHeaders = {
  status: "ok" | "fail";
  reason: string;
};

function withProxyHeaders(res: Response) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Accept, Origin");
  return res;
}

function shouldIncludeDebugHeaders() {
  return process.env.NODE_ENV !== "production" || process.env.AC_PROXY_DEBUG_HEADERS === "1";
}

function withProxyDebugHeaders(res: Response, verify?: ProxyVerifyHeaders) {
  if (!verify || !shouldIncludeDebugHeaders()) return res;
  res.headers.set("X-AC-PROXY-VERIFY", verify.status);
  if (verify.reason && verify.reason !== "ok") {
    res.headers.set("X-AC-PROXY-REASON", verify.reason);
  }
  return res;
}

function proxyJson(body: Record<string, unknown>, init?: ResponseInit, verify?: ProxyVerifyHeaders) {
  const res = NextResponse.json(body, init);
  withProxyHeaders(res);
  return withProxyDebugHeaders(res, verify);
}

type ProxyParams = { path: string[] };

function shortSignature(value: string | null) {
  if (!value) return "none";
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function logInvalidSignature(details: {
  requestId: string;
  path: string;
  shop: string | null;
  timestamp: string | null;
  provided: string | null;
  computed: string;
  canonicalLength: number;
}) {
  console.warn("Invalid app proxy signature", {
    requestId: details.requestId,
    path: details.path,
    shop: details.shop,
    timestamp: details.timestamp,
    provided: shortSignature(details.provided),
    computed: shortSignature(details.computed),
    canonicalLength: details.canonicalLength,
  });
}

function shouldSkipSignature() {
  return process.env.AC_PROXY_SKIP_SIGNATURE === "1";
}

function createRequestId() {
  return Math.random().toString(36).slice(2, 8);
}

function logProxyRequest(url: URL, method: string, requestId: string) {
  const keys = Array.from(url.searchParams.keys());
  const hasSignature = url.searchParams.has("signature") || url.searchParams.has("hmac");
  console.info("App proxy request", {
    requestId,
    method,
    path: url.pathname,
    keys,
    hasSignature,
    shop: url.searchParams.get("shop"),
  });
}

function verifySignatureOrLog(url: URL, requestId: string) {
  if (shouldSkipSignature()) {
    console.warn("App proxy signature verification skipped", { requestId, path: url.pathname });
    return { ok: true, reason: "skipped" };
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.warn("Missing SHOPIFY_API_SECRET for app proxy verification", { requestId, path: url.pathname });
    return { ok: false, reason: "missing_secret" };
  }

  const params = url.searchParams;
  const provided = getShopifyProxyProvidedSignature(params);
  const canonical = buildShopifyProxySignatureMessage(params);
  const computed = computeShopifyProxySignatureFromMessage(canonical, secret);
  const ok = provided ? compareShopifyProxySignatures(computed, provided) : false;

  if (!ok) {
    logInvalidSignature({
      requestId,
      path: url.pathname,
      shop: params.get("shop"),
      timestamp: params.get("timestamp"),
      provided,
      computed,
      canonicalLength: canonical.length,
    });
    return { ok: false, reason: provided ? "invalid_signature" : "missing_signature" };
  }

  return { ok: true, reason: "ok" };
}

function logEnvPresenceOnce() {
  const globalScope = globalThis as typeof globalThis & { __acProxyEnvLogged?: boolean };
  if (globalScope.__acProxyEnvLogged) return;
  globalScope.__acProxyEnvLogged = true;

  console.info("App proxy env presence", {
    SHOPIFY_API_SECRET: Boolean(process.env.SHOPIFY_API_SECRET),
    SHOPIFY_ADMIN_ACCESS_TOKEN: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    SHOPIFY_SHOP_DOMAIN: Boolean(process.env.SHOPIFY_SHOP_DOMAIN),
    COOKIE_DOMAIN: Boolean(process.env.COOKIE_DOMAIN),
    NODE_ENV: Boolean(process.env.NODE_ENV),
  });
}

logEnvPresenceOnce();

export async function GET(req: NextRequest, { params }: { params: Promise<ProxyParams> }) {
  let verifyHeaders: ProxyVerifyHeaders | undefined;
  try {
    const url = new URL(req.url);
    const requestId = createRequestId();
    logProxyRequest(url, req.method, requestId);

    const verification = verifySignatureOrLog(url, requestId);
    if (!verification.ok) {
      return proxyJson({ ok: false, error: "invalid_signature" }, { status: 401 }, {
        status: "fail",
        reason: verification.reason ?? "invalid_signature",
      });
    }
    verifyHeaders = { status: "ok", reason: verification.reason ?? "ok" };

    const resolvedParams = await params;
    const path = resolvedParams.path.join("/");
    if (path === "session") {
      const token = url.searchParams.get("token");
      if (!token) {
        return proxyJson({ ok: false, error: "missing_token" }, { status: 401 }, verifyHeaders);
      }

      const user = await getCustomerUserBySessionToken(token);
      if (!user) {
        return proxyJson({ ok: false, error: "unauthorized" }, { status: 401 }, verifyHeaders);
      }

      return proxyJson({ ok: true, user }, undefined, verifyHeaders);
    }

    return proxyJson({ ok: false, error: "not_found" }, { status: 404 }, verifyHeaders);
  } catch (err) {
    console.error("Proxy GET failed", err);
    return proxyJson({ ok: false, error: "internal_server_error" }, { status: 500 }, verifyHeaders);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<ProxyParams> }) {
  let verifyHeaders: ProxyVerifyHeaders | undefined;
  try {
    const url = new URL(req.url);
    const requestId = createRequestId();
    logProxyRequest(url, req.method, requestId);

    const verification = verifySignatureOrLog(url, requestId);
    if (!verification.ok) {
      return proxyJson({ ok: false, error: "invalid_signature" }, { status: 401 }, {
        status: "fail",
        reason: verification.reason ?? "invalid_signature",
      });
    }
    verifyHeaders = { status: "ok", reason: verification.reason ?? "ok" };

    const resolvedParams = await params;
    const path = resolvedParams.path.join("/");
    if (path === "login") {
      const body = await req.json().catch(() => null);
      const parsed = customerLoginSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues?.[0];
        return proxyJson({ ok: false, error: first?.message || "Invalid payload" }, { status: 400 }, verifyHeaders);
      }

      const result = await loginCustomer({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (!result) {
        return proxyJson({ ok: false, error: "invalid_credentials" }, { status: 401 }, verifyHeaders);
      }

      return proxyJson({ ok: true, token: result.token, user: result.user }, undefined, verifyHeaders);
    }
    if (path === "register") {
      const body = await req.json().catch(() => null);
      const parsed = customerRegisterSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues?.[0];
        return proxyJson({ ok: false, error: first?.message || "Invalid payload" }, { status: 400 }, verifyHeaders);
      }

      try {
        const result = await registerCustomer({
          email: parsed.data.email,
          password: parsed.data.password,
          name: parsed.data.name,
        });

        const payload: Record<string, unknown> = {
          ok: true,
          token: result.token,
          user: result.user,
        };
        if (result.warning) payload.warning = result.warning;

        return proxyJson(payload, undefined, verifyHeaders);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "email_exists") {
          return proxyJson({ ok: false, error: "email_exists" }, { status: 409 }, verifyHeaders);
        }
        if (err instanceof Error && err.message === "missing_shop_domain") {
          return proxyJson({ ok: false, error: "missing_shop_domain" }, { status: 500 }, verifyHeaders);
        }
        if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
          return proxyJson({ ok: false, error: "email_exists" }, { status: 409 }, verifyHeaders);
        }
        throw err;
      }
    }
    if (path === "logout") {
      const body = await req.json().catch(() => null);
      const tokenValue = body && typeof body === "object" && "token" in body ? body.token : null;
      const token = typeof tokenValue === "string" ? tokenValue : null;
      if (!token) {
        return proxyJson({ ok: false, error: "missing_token" }, { status: 400 }, verifyHeaders);
      }
      await deleteCustomerSession(token);
      return proxyJson({ ok: true }, undefined, verifyHeaders);
    }

    return proxyJson({ ok: false, error: "not_found" }, { status: 404 }, verifyHeaders);
  } catch (err) {
    console.error("Proxy POST failed", err);
    return proxyJson({ ok: false, error: "internal_server_error" }, { status: 500 }, verifyHeaders);
  }
}
