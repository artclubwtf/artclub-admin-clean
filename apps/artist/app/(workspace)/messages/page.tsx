import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { requireArtistContext } from "@/lib/server/artist-context";
import { listWorkspaceConversations, getWorkspaceConversationDetail } from "@/lib/server/artist-workspace-messages";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MessagesPage() {
  const context = await requireArtistContext();

  const conversations = await listWorkspaceConversations({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    viewerRole: "artist",
  });

  const firstConversation = conversations[0];
  const initialDetail = firstConversation
    ? await getWorkspaceConversationDetail({
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        threadId: firstConversation.id,
        viewerRole: "artist",
        mediaUrlResolver: resolveArtistMediaUrls,
      })
    : null;

  return <MessagesPanel initialConversations={conversations} initialDetail={initialDetail} />;
}
