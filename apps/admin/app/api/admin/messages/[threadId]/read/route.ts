import { NextResponse } from "next/server";

import { markAdminWorkspaceConversationRead } from "@/lib/artistWorkspaceMessages";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { threadId } = await params;
  const conversation = await markAdminWorkspaceConversationRead({ threadId });
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation }, { status: 200 });
}
