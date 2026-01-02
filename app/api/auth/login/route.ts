import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import { customerLoginSchema } from "@/lib/authSchemas";
import {
  createCustomerSession,
  setCustomerSessionCookie,
} from "@/lib/customerSessions";
import { connectMongo } from "@/lib/mongodb";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { UserModel } from "@/models/User";

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

    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    await connectMongo();
    const user = await UserModel.findOne({ email, role: "customer" }).lean();
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const session = await createCustomerSession(user._id.toString());
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
        shopDomain: user.shopDomain,
        createdAt: user.createdAt,
      },
    });
    setCustomerSessionCookie(res, session.token);
    return res;
  } catch (err) {
    console.error("Failed to login customer", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
