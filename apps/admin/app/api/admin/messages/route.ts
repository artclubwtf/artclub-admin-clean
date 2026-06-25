import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { listAdminWorkspaceConversations } from "@/lib/artistWorkspaceMessages";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").trim();
  const filterParam = (url.searchParams.get("filter") || "all").trim().toLowerCase();
  const filter = filterParam === "unread" || filterParam === "archived" ? filterParam : "all";

  const [conversations, unreadConversations] = await Promise.all([
    listAdminWorkspaceConversations({ query, filter }),
    listAdminWorkspaceConversations({ filter: "unread" }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      conversations,
      unreadConversationCount: unreadConversations.length,
    },
    { status: 200 },
  );
}
