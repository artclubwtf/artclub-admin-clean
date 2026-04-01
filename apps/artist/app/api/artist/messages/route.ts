import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";
import { ArtistMediaV2Model, ArtistWorkspaceMessageModel, ArtistWorkspaceThreadModel } from "@/lib/server/models";

const MAX_MESSAGES = 100;

export async function GET() {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

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

  const messages = await ArtistWorkspaceMessageModel.find({ threadId: thread._id }).sort({ createdAt: -1 }).limit(MAX_MESSAGES).lean();
  const mediaIds = Array.from(
    new Set(messages.flatMap((message) => message.mediaIds || []).map((id) => id?.toString()).filter(Boolean)),
  ) as string[];

  const mediaMap: Record<string, { id: string; url: string; previewUrl: string; filename: string }> = {};
  if (mediaIds.length) {
    const docs = await ArtistMediaV2Model.find({
      _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) },
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    }).lean();
    for (const doc of docs) {
      const urls = resolveArtistMediaUrls(doc);
      mediaMap[doc._id.toString()] = {
        id: doc._id.toString(),
        url: urls.url,
        previewUrl: urls.previewUrl,
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
          attachments: (message.mediaIds || []).map((id) => mediaMap[id.toString()]).filter(Boolean),
          createdAt: message.createdAt,
        }))
        .reverse(),
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const body = (await req.json().catch(() => null)) as { text?: string; mediaIds?: string[] } | null;
  const text = body?.text?.toString().trim() || "";
  const mediaIds = Array.isArray(body?.mediaIds) ? body.mediaIds.map((id) => id?.toString().trim()).filter(Boolean) : [];

  if (!text && !mediaIds.length) {
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
        createdAt: message.createdAt,
      },
    },
    { status: 201 },
  );
}
