import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { workspaceConversationMessageInputSchema } from "@artclub/models";

import { authOptions } from "@/lib/auth";
import { sendAdminWorkspaceMessage } from "@/lib/artistWorkspaceMessages";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "team")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;
  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = workspaceConversationMessageInputSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  try {
    const detail = await sendAdminWorkspaceMessage({
      threadId,
      senderUserId: session.user.id || undefined,
      text: parsed.data.text?.trim() || "",
      mediaIds: parsed.data.mediaIds,
    });

    return NextResponse.json({ ok: true, conversation: detail?.conversation || null, messages: detail?.messages || [] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "conversation_not_found") {
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }
    if (message === "invalid_thread_id") {
      return NextResponse.json({ ok: false, error: "invalid_thread_id" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "message_send_failed" }, { status: 500 });
  }
}
