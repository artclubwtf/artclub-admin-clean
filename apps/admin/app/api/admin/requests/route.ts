import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { RequestModel } from "@/models/Request";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const artistId = url.searchParams.get("artistId") || undefined;
  const status = url.searchParams.get("status") || undefined;

  const filter: Record<string, unknown> = {};
  if (artistId && Types.ObjectId.isValid(artistId)) filter.artistId = artistId;
  if (status) filter.status = status;

  await connectMongo();
  const requests = await RequestModel.find(filter).sort({ createdAt: -1 }).lean();

  const artistIds = Array.from(new Set(requests.map((r) => r.artistId?.toString()).filter(Boolean))) as string[];
  const artistMap = artistIds.length
    ? await ArtistModel.find({ _id: { $in: artistIds } })
        .select({ name: 1 })
        .lean()
        .then((rows) => {
          const map: Record<string, string> = {};
          rows.forEach((a) => {
            map[a._id.toString()] = a.name;
          });
          return map;
        })
    : {};

  const payload = requests.map((r) => ({
    id: r._id.toString(),
    artistId: r.artistId?.toString(),
    artistName: r.artistId ? artistMap[r.artistId.toString()] : undefined,
    type: r.type,
    status: r.status,
    payload: r.payload,
    result: r.result,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    appliedAt: r.appliedAt,
  }));

  return NextResponse.json({ requests: payload }, { status: 200 });
}
