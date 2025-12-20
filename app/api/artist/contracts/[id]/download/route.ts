import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { getS3ObjectUrl } from "@/lib/s3";
import { ContractModel } from "@/models/Contract";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid contract id" }, { status: 400 });
  }

  await connectMongo();
  const contract = await ContractModel.findOne({ _id: id, kunstlerId: session.user.artistId }).lean();
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const url = await getS3ObjectUrl(contract.s3Key);
  return NextResponse.json({ url }, { status: 200 });
}
