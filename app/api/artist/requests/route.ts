import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { RequestModel } from "@/models/Request";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await connectMongo();
  const created = await RequestModel.create({
    artistId: session.user.artistId,
    type: "payout_update",
    status: "submitted",
    payload: body,
    createdByUserId: session.user.id,
  });

  return NextResponse.json(
    {
      request: {
        id: created._id.toString(),
        type: created.type,
        status: created.status,
        payload: created.payload,
        createdAt: created.createdAt,
      },
    },
    { status: 201 },
  );
}
