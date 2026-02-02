import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/authSchemas";
import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { UserModel } from "@/models/User";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }
    const password = parsed.data.password;

    await connectMongo();
    const user = await UserModel.findById(session.user.id);
    if (!user || !user.isActive) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!user.shopDomain) {
      const shopDomain = resolveShopDomain();
      if (!shopDomain) {
        return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 500 });
      }
      user.shopDomain = shopDomain;
    }

    user.passwordHash = await hash(password, 12);
    user.mustChangePassword = false;
    await user.save();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to change password", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
