import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const emailQuery = url.searchParams.get("email")?.trim();
    const artistId = url.searchParams.get("artistId")?.trim();

    const filter: Record<string, unknown> = {};

    if (emailQuery) {
      filter.email = { $regex: emailQuery, $options: "i" };
    }

    if (artistId) {
      if (!Types.ObjectId.isValid(artistId)) {
        return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
      }
      filter.artistId = new Types.ObjectId(artistId);
    }

    await connectMongo();
    const users = await UserModel.find(filter)
      .sort({ createdAt: -1 })
      .select({ email: 1, role: 1, artistId: 1, isActive: 1, createdAt: 1 })
      .lean();

    const payload = users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      role: u.role,
      artistId: u.artistId ? u.artistId.toString() : undefined,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({ users: payload }, { status: 200 });
  } catch (err) {
    console.error("Failed to list users", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
