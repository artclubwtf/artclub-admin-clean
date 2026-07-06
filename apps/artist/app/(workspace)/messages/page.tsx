import { MessagesInbox } from "@/components/messages/MessagesInbox";
import { requireArtistContext } from "@/lib/server/artist-context";
import { listWorkspaceConversations } from "@/lib/server/artist-workspace-messages";
import { InboxClient } from "@/components/network/MessagesClient";
import { isNetworkMvpEnabled } from "@/lib/server/network-flags";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MessagesPage() {
  if (isNetworkMvpEnabled()) return <InboxClient />;
  const context = await requireArtistContext();

  const conversations = await listWorkspaceConversations({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    viewerRole: "artist",
  });

  return <MessagesInbox initialConversations={conversations} />;
}
