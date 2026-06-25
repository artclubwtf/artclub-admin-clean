import { NextResponse } from "next/server";

import { countAdminUnreadConversations } from "@/lib/artistWorkspaceMessages";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const count = await countAdminUnreadConversations();
  return NextResponse.json({ ok: true, count }, { status: 200 });
}
