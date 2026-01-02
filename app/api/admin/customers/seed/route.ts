import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { createCustomerUserSchema } from "@/lib/authSchemas";
import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { UserModel } from "@/models/User";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "team") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const base = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const payload = {
      ...base,
      shopDomain: base.shopDomain ?? process.env.SHOPIFY_SHOP_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN,
    };

    const parsed = createCustomerUserSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const shopDomain = resolveShopDomain(parsed.data.shopDomain);
    if (!shopDomain) {
      return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 400 });
    }

    await connectMongo();
    const existing = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hash(parsed.data.password, 12);
    const user = await UserModel.create({
      email,
      role: "customer",
      name: parsed.data.name?.trim() || undefined,
      shopDomain,
      shopifyCustomerGid: parsed.data.shopifyCustomerGid?.trim() || undefined,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    });

    return NextResponse.json(
      {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          name: user.name,
          shopDomain: user.shopDomain,
          shopifyCustomerGid: user.shopifyCustomerGid,
          createdAt: user.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to seed customer user", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
