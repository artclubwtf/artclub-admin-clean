import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { customerRegisterSchema } from "@/lib/authSchemas";
import {
  createCustomerSession,
  setCustomerSessionCookie,
} from "@/lib/customerSessions";
import { connectMongo } from "@/lib/mongodb";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { resolveShopDomain } from "@/lib/shopDomain";
import { UserModel } from "@/models/User";

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

    const email = parsed.data.email.toLowerCase();
    const name = parsed.data.name.trim();
    const password = parsed.data.password;
    const shopDomain = resolveShopDomain();
    if (!shopDomain) {
      return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 500 });
    }

    await connectMongo();
    const existing = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await UserModel.create({
      email,
      role: "customer",
      name,
      shopDomain,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    });

    const session = await createCustomerSession(user._id.toString());

    const res = NextResponse.json(
      {
        ok: true,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          name: user.name,
          shopDomain: user.shopDomain,
          createdAt: user.createdAt,
        },
      },
      { status: 201 },
    );
    setCustomerSessionCookie(res, session.token);
    return res;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    console.error("Failed to register customer", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
