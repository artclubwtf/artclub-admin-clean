import { hash } from "bcryptjs";
import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { UserModel } from "@/models/User";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { artistId?: string; email?: string; tempPassword?: string } | null;
    const artistId = body?.artistId?.toString().trim() ?? "";
    const emailRaw = body?.email?.toString().trim().toLowerCase() ?? "";
    const tempPassword = body?.tempPassword?.toString() ?? "";

    if (!artistId || !Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    if (!emailRaw || !emailRaw.includes("@")) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!tempPassword || tempPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Temp password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    await connectMongo();
    const artist = await ArtistModel.findById(artistId).select({ _id: 1 }).lean();
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    const existing = await UserModel.findOne({ email: emailRaw }).select({ _id: 1 }).lean();
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hash(tempPassword, 12);
    const user = await UserModel.create({
      email: emailRaw,
      role: "artist",
      artistId,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    });

    return NextResponse.json(
      {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          artistId: user.artistId?.toString(),
          isActive: user.isActive,
          createdAt: user.createdAt,
          mustChangePassword: user.mustChangePassword,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to create artist user", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
