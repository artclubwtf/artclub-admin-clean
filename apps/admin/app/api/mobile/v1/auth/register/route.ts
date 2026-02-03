import { NextResponse } from "next/server";
import { hash } from "bcryptjs";

import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { createMobileSession } from "@/lib/mobileAuth";
import { UserModel } from "@/models/User";

type RegisterPayload = {
  email?: string;
  password?: string;
  name?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as RegisterPayload | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const shopDomain = resolveShopDomain();
    if (!shopDomain) {
      return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 500 });
    }

    await connectMongo();

    const existing = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
    if (existing) {
      return NextResponse.json({ error: "email already exists" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await UserModel.create({
      email,
      role: "customer",
      name: name || undefined,
      shopDomain,
      shopifyCustomerGid: null,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    });

    const session = await createMobileSession(user._id.toString());

    return NextResponse.json(
      {
        ok: true,
        token: session.token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? undefined,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to register mobile user", err);
    const message = err instanceof Error ? err.message : "Failed to register user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
