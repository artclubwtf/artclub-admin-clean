import { NextResponse } from "next/server";

import { workspaceConversationMessageInputSchema } from "@artclub/models";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import {
  getOrCreateGeneralConversation,
  sendWorkspaceMessage,
} from "@/lib/artistWorkspaceMessages";

export async function GET() {
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const detail = await getOrCreateGeneralConversation({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    userId: context.user._id,
    viewerRole: "artist",
  });

  return NextResponse.json(
    {
      ok: true,
      thread: detail ? { id: detail.conversation.id, lastMessageAt: detail.conversation.lastMessageAt || null } : null,
      messages: detail?.messages || [],
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = workspaceConversationMessageInputSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const detail = await getOrCreateGeneralConversation({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    userId: context.user._id,
    viewerRole: "artist",
  });
  if (!detail) {
    return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
  }

  const sent = await sendWorkspaceMessage({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    threadId: detail.conversation.id,
    senderRole: "artist",
    senderUserId: context.user._id,
    senderLabel: context.canonicalArtist.displayName || context.user.name || "Artist",
    text: parsed.data.text?.trim() || "",
    mediaIds: parsed.data.mediaIds,
  });

  return NextResponse.json(
    {
      ok: true,
      message: sent?.messages[sent.messages.length - 1] || null,
    },
    { status: 201 },
  );
}
