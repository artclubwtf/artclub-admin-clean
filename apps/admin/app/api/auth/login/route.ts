import { NextResponse } from "next/server";

import { customerLoginSchema } from "@/lib/authSchemas";
import { loginCustomer } from "@/lib/customerAuth";
import { setCustomerSessionCookie } from "@/lib/customerSessions";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`auth:login:${ip}`, { limit: 5, windowMs: 60_000 });
    if (!limit.ok) {
      const res = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      res.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return res;
    }

    const body = await req.json().catch(() => null);
    const parsed = customerLoginSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const result = await loginCustomer({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (!result) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const res = NextResponse.json({
      ok: true,
      user: result.user,
    });
    setCustomerSessionCookie(res, result.token);
    return res;
  } catch (err) {
    console.error("Failed to login customer", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
