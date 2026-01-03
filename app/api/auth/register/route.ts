import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { customerRegisterSchema } from "@/lib/authSchemas";
import {
  createCustomerSession,
  setCustomerSessionCookie,
} from "@/lib/customerSessions";
import { connectMongo } from "@/lib/mongodb";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { createCustomer, findCustomerByEmail } from "@/lib/shopify.customers";
import { resolveShopDomain } from "@/lib/shopDomain";
import { UserModel } from "@/models/User";

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  const [firstName, ...rest] = parts;
  const lastName = rest.join(" ").trim();
  return { firstName, lastName: lastName || undefined };
}

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
      shopifyCustomerGid: null,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    });

    let shopifyCustomerGid: string | null = null;
    let warning: string | undefined;

    try {
      const { firstName, lastName } = splitName(name);
      const existingCustomer = await findCustomerByEmail(email);
      if (existingCustomer?.id) {
        shopifyCustomerGid = existingCustomer.id;
        if (process.env.NODE_ENV !== "production") {
          console.log("linked customer gid", shopifyCustomerGid);
        }
      } else {
        const createdCustomer = await createCustomer({ email, firstName, lastName });
        shopifyCustomerGid = createdCustomer.id;
        if (process.env.NODE_ENV !== "production") {
          console.log("created customer gid", shopifyCustomerGid);
        }
      }

      await UserModel.updateOne({ _id: user._id }, { shopifyCustomerGid });
    } catch (err) {
      warning = "Shopify customer sync failed";
      shopifyCustomerGid = null;
      try {
        await UserModel.updateOne({ _id: user._id }, { shopifyCustomerGid: null });
      } catch (updateErr) {
        console.error("Failed to store Shopify customer gid", updateErr);
      }
      console.error("Failed to sync Shopify customer", err);
    }

    const session = await createCustomerSession(user._id.toString());

    const payload: {
      ok: true;
      user: {
        id: string;
        email: string;
        role: string;
        name?: string;
        shopDomain?: string;
        shopifyCustomerGid: string | null;
        createdAt?: Date;
      };
      warning?: string;
    } = {
      ok: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
        shopDomain: user.shopDomain,
        shopifyCustomerGid,
        createdAt: user.createdAt,
      },
    };
    if (warning) payload.warning = warning;

    const res = NextResponse.json(
      payload,
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
