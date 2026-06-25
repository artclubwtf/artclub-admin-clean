import { NextResponse } from "next/server";

import { getAdminWorkspaceConversationDetail } from "@/lib/artistWorkspaceMessages";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { threadId } = await params;
  const detail = await getAdminWorkspaceConversationDetail({ threadId });
  if (!detail) {
    return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation: detail.conversation, messages: detail.messages, artist: detail.artist }, { status: 200 });
}
