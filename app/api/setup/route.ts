import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

const MIN_PASSWORD_LENGTH = 8;

async function getUserCount() {
  await connectMongo();
  return UserModel.countDocuments();
}

export async function GET() {
  try {
    const count = await getUserCount();
    if (count > 0) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
    }

    return NextResponse.json({ ready: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to check setup status", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
    const email = body?.email?.toString().trim().toLowerCase() ?? "";
    const password = body?.password?.toString() ?? "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    await connectMongo();
    const existingCount = await UserModel.countDocuments();
    if (existingCount > 0) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 403 });
    }

    const passwordHash = await hash(password, 12);
    const user = await UserModel.create({
      email,
      role: "team",
      passwordHash,
      mustChangePassword: false,
    });

    return NextResponse.json(
      { user: { id: user._id.toString(), email: user.email, role: user.role } },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    console.error("Failed to complete setup", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
