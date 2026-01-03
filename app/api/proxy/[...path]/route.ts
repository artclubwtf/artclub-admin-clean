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

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function withProxyHeaders(res: Response) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Accept, Origin");
  return res;
}

function proxyJson(body: Record<string, unknown>, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  return withProxyHeaders(res);
}

type ProxyParams = { path: string[] };

function shortSignature(value: string | null) {
  if (!value) return "none";
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function logInvalidSignature(details: {
  path: string;
  shop: string | null;
  timestamp: string | null;
  provided: string | null;
  computed: string;
  canonicalLength: number;
}) {
  console.warn("Invalid app proxy signature", {
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

function verifySignatureOrLog(url: URL) {
  if (shouldSkipSignature()) {
    console.warn("App proxy signature verification skipped");
    return true;
  }

  const secret = mustEnv("SHOPIFY_API_SECRET");
  const params = url.searchParams;
  const provided = getShopifyProxyProvidedSignature(params);
  const canonical = buildShopifyProxySignatureMessage(params);
  const computed = computeShopifyProxySignatureFromMessage(canonical, secret);
  const ok = provided ? compareShopifyProxySignatures(computed, provided) : false;

  if (!ok) {
    logInvalidSignature({
      path: url.pathname,
      shop: params.get("shop"),
      timestamp: params.get("timestamp"),
      provided,
      computed,
      canonicalLength: canonical.length,
    });
  }

  return ok;
}

export async function GET(req: NextRequest, { params }: { params: Promise<ProxyParams> }) {
  try {
    const url = new URL(req.url);
    if (!verifySignatureOrLog(url)) {
      return proxyJson({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    const resolvedParams = await params;
    const path = resolvedParams.path.join("/");
    if (path === "session") {
      const token = url.searchParams.get("token");
      if (!token) {
        return proxyJson({ ok: false, error: "missing_token" }, { status: 401 });
      }

      const user = await getCustomerUserBySessionToken(token);
      if (!user) {
        return proxyJson({ ok: false, error: "unauthorized" }, { status: 401 });
      }

      return proxyJson({ ok: true, user });
    }

    return proxyJson({ ok: false, error: "not_found" }, { status: 404 });
  } catch (err) {
    console.error("Proxy GET failed", err);
    return proxyJson({ ok: false, error: "internal_server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<ProxyParams> }) {
  try {
    const url = new URL(req.url);
    if (!verifySignatureOrLog(url)) {
      return proxyJson({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    const resolvedParams = await params;
    const path = resolvedParams.path.join("/");
    if (path === "login") {
      const body = await req.json().catch(() => null);
      const parsed = customerLoginSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues?.[0];
        return proxyJson({ ok: false, error: first?.message || "Invalid payload" }, { status: 400 });
      }

      const result = await loginCustomer({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (!result) {
        return proxyJson({ ok: false, error: "invalid_credentials" }, { status: 401 });
      }

      return proxyJson({ ok: true, token: result.token, user: result.user });
    }
    if (path === "register") {
      const body = await req.json().catch(() => null);
      const parsed = customerRegisterSchema.safeParse(body);
      if (!parsed.success) {
        const first = parsed.error.issues?.[0];
        return proxyJson({ ok: false, error: first?.message || "Invalid payload" }, { status: 400 });
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

        return proxyJson(payload);
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "email_exists") {
          return proxyJson({ ok: false, error: "email_exists" }, { status: 409 });
        }
        if (err instanceof Error && err.message === "missing_shop_domain") {
          return proxyJson({ ok: false, error: "missing_shop_domain" }, { status: 500 });
        }
        if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
          return proxyJson({ ok: false, error: "email_exists" }, { status: 409 });
        }
        throw err;
      }
    }
    if (path === "logout") {
      const body = await req.json().catch(() => null);
      const tokenValue = body && typeof body === "object" && "token" in body ? body.token : null;
      const token = typeof tokenValue === "string" ? tokenValue : null;
      if (!token) {
        return proxyJson({ ok: false, error: "missing_token" }, { status: 400 });
      }
      await deleteCustomerSession(token);
      return proxyJson({ ok: true });
    }

    return proxyJson({ ok: false, error: "not_found" }, { status: 404 });
  } catch (err) {
    console.error("Proxy POST failed", err);
    return proxyJson({ ok: false, error: "internal_server_error" }, { status: 500 });
  }
}
