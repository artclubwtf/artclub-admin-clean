import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { MessageModel } from "@/models/Message";
import { MessageThreadModel } from "@/models/MessageThread";

const MAX_MESSAGES = 50;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const thread = await MessageThreadModel.findOne({ artistId: session.user.artistId }).lean();

  if (!thread) {
    return NextResponse.json({ thread: null, messages: [] }, { status: 200 });
  }

  const messages = await MessageModel.find({ threadId: thread._id })
    .sort({ createdAt: -1 })
    .limit(MAX_MESSAGES)
    .lean();

  const mediaIds = Array.from(
    new Set(
      messages
        .flatMap((m) => m.mediaIds || [])
        .map((id) => id?.toString())
        .filter(Boolean),
    ),
  ) as string[];

  const mediaMap =
    mediaIds.length > 0
      ? await MediaModel.find({ _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) }, artistId: session.user.artistId })
          .select({ filename: 1, url: 1, mimeType: 1 })
          .lean()
          .then((rows) => {
            const map: Record<string, { id: string; filename?: string; url?: string; mimeType?: string }> = {};
            rows.forEach((m) => {
              map[m._id.toString()] = {
                id: m._id.toString(),
                filename: m.filename ?? undefined,
                url: m.url ?? undefined,
                mimeType: m.mimeType ?? undefined,
              };
            });
            return map;
          })
      : {};

  const payload = messages
    .map((m) => ({
      id: m._id.toString(),
      senderRole: m.senderRole,
      text: m.text,
      mediaIds: (m.mediaIds || []).map((id) => id.toString()),
      attachments: (m.mediaIds || [])
        .map((id) => mediaMap[id.toString()])
        .filter(Boolean),
      createdAt: m.createdAt,
    }))
    .reverse();

  return NextResponse.json({ thread: { id: thread._id.toString() }, messages: payload }, { status: 200 });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { text?: string; mediaIds?: string[] } | null;
  const text = body?.text?.toString().trim() ?? "";
  const mediaIdsRaw = Array.isArray(body?.mediaIds) ? body?.mediaIds : [];
  const mediaIds = mediaIdsRaw.map((id) => id?.toString()).filter(Boolean);

  if (!text && mediaIds.length === 0) {
    return NextResponse.json({ error: "Message requires text or attachment" }, { status: 400 });
  }

  await connectMongo();

  let thread = await MessageThreadModel.findOne({ artistId: session.user.artistId });
  if (!thread) {
    thread = await MessageThreadModel.create({
      artistId: session.user.artistId,
      lastMessageAt: new Date(),
    });
  }

  let allowedMediaIds: Types.ObjectId[] = [];
  if (mediaIds.length) {
    const ownedMedia = await MediaModel.find({
      _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) },
      artistId: session.user.artistId,
    })
      .select({ _id: 1 })
      .lean();
    allowedMediaIds = ownedMedia.map((m) => new Types.ObjectId(m._id));
  }

  const message = await MessageModel.create({
    threadId: thread._id,
    artistId: session.user.artistId,
    senderRole: "artist",
    text,
    mediaIds: allowedMediaIds,
  });

  thread.lastMessageAt = new Date();
  await thread.save();

  return NextResponse.json(
    {
      message: {
        id: message._id.toString(),
        senderRole: message.senderRole,
        text: message.text,
        mediaIds: allowedMediaIds.map((id) => id.toString()),
        createdAt: message.createdAt,
      },
    },
    { status: 201 },
  );
}
