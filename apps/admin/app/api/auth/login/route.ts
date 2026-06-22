import { compare } from "bcryptjs";
import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";

import { authCredentialsSchema } from "@/lib/authSchemas";
import { getAuthSecret } from "@/lib/authSecret";
import { connectMongo } from "@/lib/mongodb";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { UserModel } from "@/models/User";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getSessionCookieName(req: Request) {
  const isSecure =
    req.headers.get("x-forwarded-proto") === "https" ||
    new URL(req.url).protocol === "https:";
  return `${isSecure ? "__Secure-" : ""}next-auth.session-token`;
}

function toAdminUserPayload(user: {
  _id: { toString(): string };
  email: string;
  role: string;
  name?: string | null;
  mustChangePassword?: boolean | null;
}) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    name: user.name || undefined,
    mustChangePassword: user.mustChangePassword === true,
  };
}

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
    const parsed = authCredentialsSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    await connectMongo();
    const user = await UserModel.findOne({ email, role: { $in: ["admin", "team"] } }).lean();
    if (!user || user.isActive === false || (user as { disabled?: boolean }).disabled === true || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = {
      sub: user._id.toString(),
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword === true,
    };
    const secret = getAuthSecret();
    if (!secret) {
      console.error("Admin login failed: missing NEXTAUTH_SECRET");
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const sessionToken = await encode({
      token,
      secret,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    const res = NextResponse.json({
      ok: true,
      user: toAdminUserPayload(user),
    });
    const cookieName = getSessionCookieName(req);
    res.cookies.set({
      name: cookieName,
      value: sessionToken,
      httpOnly: true,
      secure: cookieName.startsWith("__Secure-"),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("Failed to login admin user", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
