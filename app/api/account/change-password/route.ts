import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { password?: string } | null;
    const password = body?.password?.toString() ?? "";
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    await connectMongo();
    const user = await UserModel.findById(session.user.id);
    if (!user || !user.isActive) return NextResponse.json({ error: "User not found" }, { status: 404 });

    user.passwordHash = await hash(password, 12);
    user.mustChangePassword = false;
    await user.save();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to change password", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
