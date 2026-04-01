import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  createWorkspaceConversation,
  getWorkspaceConversationDetail,
  getOrCreateGeneralConversation,
  listWorkspaceConversations,
  resolveWorkspaceOwnerByLegacyArtistId,
  sendWorkspaceMessage,
} from "@/lib/artistWorkspaceMessages";
import { workspaceConversationCreateInputSchema, workspaceConversationMessageInputSchema } from "@artclub/models";

async function requireTeamSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return null;
  }
  return session;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireTeamSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const owner = await resolveWorkspaceOwnerByLegacyArtistId(id);
  if (!owner) {
    return NextResponse.json({ thread: null, conversations: [], messages: [] }, { status: 200 });
  }

  const conversations = await listWorkspaceConversations({
    shopDomain: owner.shopDomain,
    artistKey: owner.artistKey,
    viewerRole: "team",
  });

  const compatibilityThread = conversations[0]
    ? await getWorkspaceConversationDetail({
        shopDomain: owner.shopDomain,
        artistKey: owner.artistKey,
        threadId: conversations[0].id,
        viewerRole: "team",
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
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireTeamSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teamUser = session.user;

  const { id } = await params;
  const owner = await resolveWorkspaceOwnerByLegacyArtistId(id);
  if (!owner) {
    return NextResponse.json({ error: "artist_workspace_not_available" }, { status: 404 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const createIntent =
    Boolean(payload && typeof payload === "object" && ("subject" in payload || "type" in payload || "references" in payload));
  const createParsed = workspaceConversationCreateInputSchema.safeParse(payload || {});
  if (createIntent) {
    if (!createParsed.success) {
      const issue = createParsed.error.issues[0];
      return NextResponse.json({ error: issue?.message || "invalid_payload" }, { status: 400 });
    }
    const detail = await createWorkspaceConversation({
      shopDomain: owner.shopDomain,
      artistKey: owner.artistKey,
      userId: owner.userId,
      senderUserId: teamUser?.id || undefined,
      senderRole: "team",
      senderLabel: teamUser?.name || "ARTCLUB Team",
      subject: createParsed.data.subject,
      type: createParsed.data.type,
      text: createParsed.data.text?.trim() || "",
      mediaIds: createParsed.data.mediaIds,
      references: createParsed.data.references,
    });

    return NextResponse.json({ ok: true, conversation: detail?.conversation, messages: detail?.messages || [] }, { status: 201 });
  }

  const messageParsed = workspaceConversationMessageInputSchema.safeParse(payload || {});
  if (!messageParsed.success) {
    const issue = messageParsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const detail = await getOrCreateGeneralConversation({
    shopDomain: owner.shopDomain,
    artistKey: owner.artistKey,
    userId: owner.userId,
    viewerRole: "team",
  });

  if (!detail) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  const sent = await sendWorkspaceMessage({
    shopDomain: owner.shopDomain,
    artistKey: owner.artistKey,
    threadId: detail.conversation.id,
    senderRole: "team",
    senderUserId: teamUser?.id || undefined,
    senderLabel: teamUser?.name || "ARTCLUB Team",
    text: messageParsed.data.text?.trim() || "",
    mediaIds: messageParsed.data.mediaIds,
  });

  return NextResponse.json(
    {
      ok: true,
      message: sent?.messages[sent.messages.length - 1] || null,
      conversation: sent?.conversation || null,
      messages: sent?.messages || [],
    },
    { status: 201 },
  );
}
