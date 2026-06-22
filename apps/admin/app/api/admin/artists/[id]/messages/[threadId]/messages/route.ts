import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { workspaceConversationMessageInputSchema } from "@artclub/models";

import { authOptions } from "@/lib/auth";
import {
  resolveWorkspaceOwnerByLegacyArtistId,
  sendWorkspaceMessage,
} from "@/lib/artistWorkspaceMessages";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; threadId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "team")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, threadId } = await params;
  const owner = await resolveWorkspaceOwnerByLegacyArtistId(id);
  if (!owner) {
    return NextResponse.json({ error: "artist_workspace_not_available" }, { status: 404 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = workspaceConversationMessageInputSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  try {
    const detail = await sendWorkspaceMessage({
      shopDomain: owner.shopDomain,
      artistKey: owner.artistKey,
      threadId,
      senderRole: "team",
      senderUserId: session.user.id || undefined,
      senderLabel: session.user.name || "ARTCLUB Team",
      text: parsed.data.text?.trim() || "",
      mediaIds: parsed.data.mediaIds,
    });

    if (!detail) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, conversation: detail.conversation, messages: detail.messages }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "conversation_not_found") {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }
    if (message === "invalid_thread_id") {
      return NextResponse.json({ error: "invalid_thread_id" }, { status: 400 });
    }
    console.error("Admin workspace reply failed", error);
    return NextResponse.json({ error: "message_send_failed" }, { status: 500 });
  }
}
