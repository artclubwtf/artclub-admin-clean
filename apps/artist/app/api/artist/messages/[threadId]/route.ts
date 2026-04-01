import { NextResponse } from "next/server";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { getWorkspaceConversationDetail } from "@/lib/server/artist-workspace-messages";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";

export async function GET(_: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { threadId } = await params;

  try {
    const detail = await getWorkspaceConversationDetail({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      threadId,
      viewerRole: "artist",
      mediaUrlResolver: resolveArtistMediaUrls,
    });

    if (!detail) {
      return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, conversation: detail.conversation, messages: detail.messages }, { status: 200 });
  } catch (error) {
    return artistApiErrorResponse(error, "conversation_detail_failed");
  }
}
