import { NextResponse } from "next/server";

import { workspaceConversationCreateInputSchema } from "@artclub/models";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import {
  createWorkspaceConversation,
  getWorkspaceConversationDetail,
  listWorkspaceConversations,
} from "@/lib/server/artist-workspace-messages";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";

export async function GET() {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  try {
    const conversations = await listWorkspaceConversations({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      viewerRole: "artist",
    });

    const compatibilityThread = conversations[0]
      ? await getWorkspaceConversationDetail({
          shopDomain: context.user.shopDomain,
          artistKey: context.user.artistKey,
          threadId: conversations[0].id,
          viewerRole: "artist",
          mediaUrlResolver: resolveArtistMediaUrls,
        })
      : null;

    return NextResponse.json(
      {
        ok: true,
        conversations,
        thread: compatibilityThread ? { id: compatibilityThread.conversation.id } : null,
        messages: compatibilityThread?.messages || [],
      },
      { status: 200 },
    );
  } catch (error) {
    return artistApiErrorResponse(error, "messages_list_failed");
  }
}

export async function POST(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = workspaceConversationCreateInputSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  try {
    const detail = await createWorkspaceConversation({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      userId: context.user._id,
      senderUserId: context.user._id,
      senderRole: "artist",
      senderLabel: context.canonicalArtist.displayName || context.user.name || "Artist",
      subject: parsed.data.subject,
      type: parsed.data.type,
      text: parsed.data.text?.trim() || "",
      mediaIds: parsed.data.mediaIds,
      references: parsed.data.references,
      mediaUrlResolver: resolveArtistMediaUrls,
    });

    return NextResponse.json({ ok: true, conversation: detail?.conversation, messages: detail?.messages || [] }, { status: 201 });
  } catch (error) {
    return artistApiErrorResponse(error, "conversation_create_failed");
  }
}
