import { NextResponse } from "next/server";

import { customerRegisterSchema } from "@/lib/authSchemas";
import { registerCustomer } from "@/lib/customerAuth";
import { setCustomerSessionCookie } from "@/lib/customerSessions";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`auth:register:${ip}`, { limit: 5, windowMs: 60_000 });
    if (!limit.ok) {
      const res = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      res.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return res;
    }

    const body = await req.json().catch(() => null);
    const parsed = customerRegisterSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const result = await registerCustomer({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });

    const payload: { ok: true; user: typeof result.user; warning?: string } = {
      ok: true,
      user: result.user,
    };
    if (result.warning) payload.warning = result.warning;

    const res = NextResponse.json(payload, { status: 201 });
    setCustomerSessionCookie(res, result.token);
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "email_exists") {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    if (err instanceof Error && err.message === "missing_shop_domain") {
      return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 500 });
    }
    if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    console.error("Failed to register customer", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
