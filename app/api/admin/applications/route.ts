import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const qRaw = url.searchParams.get("q") || "";
  const q = qRaw.trim();

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (q) {
    const or: Record<string, unknown>[] = [
      { "personal.fullName": { $regex: q, $options: "i" } },
      { "personal.email": { $regex: q, $options: "i" } },
    ];
    if (Types.ObjectId.isValid(q)) {
      or.push({ _id: new Types.ObjectId(q) });
    }
    filter.$or = or;
  }

  await connectMongo();
  const applications = await ArtistApplicationModel.find(filter).sort({ createdAt: -1 }).lean();

  const payload = applications.map((app) => ({
    id: app._id.toString(),
    status: app.status,
    personal: {
      fullName: app.personal?.fullName ?? null,
      email: app.personal?.email ?? null,
    },
    submittedAt: app.submittedAt,
    reviewedAt: app.reviewedAt,
    acceptedAt: app.acceptedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  }));

  return NextResponse.json({ applications: payload }, { status: 200 });
}
