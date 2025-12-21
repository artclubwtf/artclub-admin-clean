import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { RequestModel } from "@/models/Request";

const artworkPayloadSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    shortDescription: z.string().trim().optional(),
    widthCm: z
      .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().positive().optional()),
    heightCm: z
      .preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().positive().optional()),
    offering: z.enum(["print_only", "original_plus_prints"]),
    originalPriceEur: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
      z.number().positive().optional(),
    ),
    mediaIds: z.array(z.string().trim().min(1)).min(1, "At least one artwork image is required"),
  })
  .refine((val) => (val.offering === "original_plus_prints" ? !!val.originalPriceEur : true), {
    message: "Original price is required when selling originals",
    path: ["originalPriceEur"],
  });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const reqType = body?.type === "artwork_create" ? "artwork_create" : "payout_update";

  await connectMongo();

  if (reqType === "artwork_create") {
    const rawPayload = body?.payload;
    if (!rawPayload || typeof rawPayload !== "object") {
      return NextResponse.json({ error: "Payload is required" }, { status: 400 });
    }

    const parsed = artworkPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || "Invalid payload";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { mediaIds } = parsed.data;
    const objectIds = mediaIds
      .filter((mid) => Types.ObjectId.isValid(mid))
      .map((mid) => new Types.ObjectId(mid));

    if (objectIds.length !== mediaIds.length) {
      return NextResponse.json({ error: "Invalid media selection" }, { status: 400 });
    }

    const ownedMedia = await MediaModel.find({
      _id: { $in: objectIds },
      artistId: session.user.artistId,
      kind: "artwork",
    })
      .select({ _id: 1 })
      .lean();

    if (ownedMedia.length !== mediaIds.length) {
      return NextResponse.json({ error: "Some media are not available" }, { status: 400 });
    }

    const payload = {
      ...parsed.data,
      mediaIds: ownedMedia.map((m) => m._id.toString()),
    };

    const created = await RequestModel.create({
      artistId: session.user.artistId,
      type: "artwork_create",
      status: "submitted",
      payload,
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

  // Default: payout_update
  const payload = typeof body === "object" ? body : {};
  const created = await RequestModel.create({
    artistId: session.user.artistId,
    type: "payout_update",
    status: "submitted",
    payload,
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const requests = await RequestModel.find({ artistId: session.user.artistId })
    .sort({ createdAt: -1 })
    .lean();

  const payload = requests.map((r) => ({
    id: r._id.toString(),
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
