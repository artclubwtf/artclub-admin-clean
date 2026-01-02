import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { CustomerSessionModel } from "@/models/CustomerSession";

export const CUSTOMER_SESSION_COOKIE = "ac_customer_session";
export const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(header: string | null) {
  if (!header) return {} as Record<string, string>;
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function getCustomerSessionToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.get("cookie"));
  return cookies[CUSTOMER_SESSION_COOKIE] ?? null;
}

export function setCustomerSessionCookie(res: NextResponse, token: string) {
  res.cookies.set({
    name: CUSTOMER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(CUSTOMER_SESSION_TTL_MS / 1000),
  });
}

export function clearCustomerSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: CUSTOMER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function createCustomerSession(userId: string) {
  await connectMongo();
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomBytes(32).toString("hex");
    try {
      await CustomerSessionModel.create({ userId, token, expiresAt });
      return { token, expiresAt };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to create session");
}

export async function getCustomerSession(token: string) {
  await connectMongo();
  const session = await CustomerSessionModel.findOne({ token }).lean();
  if (!session) return null;
  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    await CustomerSessionModel.deleteOne({ _id: session._id });
    return null;
  }
  return session;
}

export async function deleteCustomerSession(token: string) {
  await connectMongo();
  await CustomerSessionModel.deleteOne({ token });
}
