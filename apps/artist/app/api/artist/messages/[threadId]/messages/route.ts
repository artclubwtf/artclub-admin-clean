import { NextResponse } from "next/server";

import { workspaceConversationMessageInputSchema } from "@artclub/models";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { sendWorkspaceMessage } from "@/lib/server/artist-workspace-messages";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { threadId } = await params;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = workspaceConversationMessageInputSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  try {
    const detail = await sendWorkspaceMessage({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      threadId,
      senderRole: "artist",
      senderUserId: context.user._id,
      senderLabel: context.canonicalArtist.displayName || context.user.name || "Artist",
      text: parsed.data.text?.trim() || "",
      mediaIds: parsed.data.mediaIds,
      mediaUrlResolver: resolveArtistMediaUrls,
    });

    if (!detail) {
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, conversation: detail.conversation, messages: detail.messages }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "conversation_not_found") {
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "invalid_thread_id") {
      return NextResponse.json({ ok: false, error: "invalid_thread_id" }, { status: 400 });
    }
    return artistApiErrorResponse(error, "message_send_failed");
  }
}
