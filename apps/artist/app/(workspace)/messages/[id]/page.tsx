import { notFound } from "next/navigation";

import { ConversationThreadPage } from "@/components/messages/ConversationThreadPage";
import { requireArtistContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";
import { getWorkspaceConversationDetail } from "@/lib/server/artist-workspace-messages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireArtistContext();
  const { id } = await params;

  const detail = await getWorkspaceConversationDetail({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    threadId: id,
    viewerRole: "artist",
    mediaUrlResolver: resolveArtistMediaUrls,
  });

  if (!detail) notFound();

  return <ConversationThreadPage initialDetail={detail} />;
}
