import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ContractModel } from "@/models/Contract";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const contracts = await ContractModel.find({ kunstlerId: session.user.artistId })
    .select({ filename: 1, contractType: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();

  const payload = contracts.map((c) => ({
    id: c._id.toString(),
    filename: c.filename,
    contractType: c.contractType,
    createdAt: c.createdAt,
  }));

  return NextResponse.json({ contracts: payload }, { status: 200 });
}
