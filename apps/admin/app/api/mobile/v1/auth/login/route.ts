import { NextResponse } from "next/server";
import { compare } from "bcryptjs";

import { connectMongo } from "@/lib/mongodb";
import { createMobileSession } from "@/lib/mobileAuth";
import { UserModel } from "@/models/User";

type LoginPayload = {
  email?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as LoginPayload | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    await connectMongo();
    const user = await UserModel.findOne({ email, role: "customer" }).lean();
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

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
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to login mobile user", err);
    const message = err instanceof Error ? err.message : "Failed to login";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
