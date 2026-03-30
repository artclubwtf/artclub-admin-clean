import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { ArtistMediaV2Model } from "@/models/ArtistMediaV2";
import { ArtistWorkspaceMessageModel } from "@/models/ArtistWorkspaceMessage";
import { ArtistWorkspaceThreadModel } from "@/models/ArtistWorkspaceThread";

const MAX_MESSAGES = 100;

export async function GET() {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  let thread = await ArtistWorkspaceThreadModel.findOne({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  }).lean();

  if (!thread) {
    const created = await ArtistWorkspaceThreadModel.create({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      userId: context.user._id,
      lastMessageAt: null,
    });
    thread = created.toObject();
  }

  const messages = await ArtistWorkspaceMessageModel.find({ threadId: thread._id })
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

  const mediaMap: Record<string, { id: string; url: string; previewUrl: string; filename: string }> = {};
  if (mediaIds.length > 0) {
    const docs = await ArtistMediaV2Model.find({
      _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) },
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    }).lean();
    for (const doc of docs) {
      mediaMap[doc._id.toString()] = {
        id: doc._id.toString(),
        url: doc.url,
        previewUrl: doc.previewUrl || doc.url,
        filename: doc.filename || "attachment",
      };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      thread: { id: thread._id.toString(), lastMessageAt: thread.lastMessageAt || null },
      messages: messages
        .map((message) => ({
          id: message._id.toString(),
          senderRole: message.senderRole,
          text: message.text || "",
          mediaIds: (message.mediaIds || []).map((id) => id.toString()),
          attachments: (message.mediaIds || []).map((id) => mediaMap[id.toString()]).filter(Boolean),
          createdAt: message.createdAt,
        }))
        .reverse(),
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const body = (await req.json().catch(() => null)) as { text?: string; mediaIds?: string[] } | null;
  const text = body?.text?.toString().trim() || "";
  const mediaIds = Array.isArray(body?.mediaIds)
    ? body.mediaIds.map((id) => id?.toString().trim()).filter(Boolean)
    : [];

  if (!text && mediaIds.length === 0) {
    return NextResponse.json({ ok: false, error: "message_requires_content" }, { status: 400 });
  }

  let thread = await ArtistWorkspaceThreadModel.findOne({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  });
  if (!thread) {
    thread = await ArtistWorkspaceThreadModel.create({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      userId: context.user._id,
      lastMessageAt: new Date(),
    });
  }

  const validMediaIds = mediaIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  const ownedMedia = validMediaIds.length
    ? await ArtistMediaV2Model.find({
        _id: { $in: validMediaIds },
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
      })
        .select({ _id: 1 })
        .lean()
    : [];

  const message = await ArtistWorkspaceMessageModel.create({
    threadId: thread._id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    senderRole: "artist",
    text,
    mediaIds: ownedMedia.map((item) => item._id),
  });

  thread.lastMessageAt = new Date();
  await thread.save();

  return NextResponse.json(
    {
      ok: true,
      message: {
        id: message._id.toString(),
        senderRole: message.senderRole,
        text: message.text || "",
        mediaIds: (message.mediaIds || []).map((id) => id.toString()),
        createdAt: message.createdAt,
      },
    },
    { status: 201 },
  );
}
