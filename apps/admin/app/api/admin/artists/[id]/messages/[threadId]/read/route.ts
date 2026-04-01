import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  markWorkspaceConversationRead,
  resolveWorkspaceOwnerByLegacyArtistId,
} from "@/lib/artistWorkspaceMessages";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; threadId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, threadId } = await params;
  const owner = await resolveWorkspaceOwnerByLegacyArtistId(id);
  if (!owner) {
    return NextResponse.json({ error: "artist_workspace_not_available" }, { status: 404 });
  }

  const conversation = await markWorkspaceConversationRead({
    shopDomain: owner.shopDomain,
    artistKey: owner.artistKey,
    threadId,
    viewerRole: "team",
  });
  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, conversation }, { status: 200 });
}
