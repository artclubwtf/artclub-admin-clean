import { NextResponse } from "next/server";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { markWorkspaceConversationRead } from "@/lib/server/artist-workspace-messages";
import { requireArtistApiContext } from "@/lib/server/artist-context";

export async function POST(_: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { threadId } = await params;

  try {
    const conversation = await markWorkspaceConversationRead({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      threadId,
      viewerRole: "artist",
    });

    if (!conversation) {
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, conversation }, { status: 200 });
  } catch (error) {
    return artistApiErrorResponse(error, "conversation_mark_read_failed");
  }
}
