import Link from "next/link";

import { ArtistTopbarClient } from "@/components/layout/ArtistTopbarClient";
import { listWorkspaceConversations } from "@/lib/server/artist-workspace-messages";
import { normalizePublicArtistMediaUrl } from "@/lib/server/artist-media";
import type { ArtistContext } from "@/lib/server/artist-context";

type ArtistTopbarProps = {
  context: ArtistContext;
};

export async function ArtistTopbar({ context }: ArtistTopbarProps) {
  const conversations = await listWorkspaceConversations({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    viewerRole: "artist",
  });

  const hasUnreadMessages = conversations.some((item) => item.unreadCount > 0);
  const displayName = context.canonicalArtist.displayName || context.user.name || context.user.email || "Artist";
  const handle = context.canonicalArtist.handle || context.user.artistKey;
  const avatarUrl = normalizePublicArtistMediaUrl(context.canonicalArtist.profileImages?.avatarUrl || "");

  return (
    <header className="sticky top-0 z-30 bg-white/96 backdrop-blur-sm">
      <div className="flex items-center justify-between py-2">
        <Link href="/" className="text-[2rem] font-semibold tracking-[-0.06em] text-neutral-300">
          artclub
        </Link>
        <ArtistTopbarClient
          avatarUrl={avatarUrl}
          displayName={displayName}
          handle={handle}
          hasUnreadMessages={hasUnreadMessages}
        />
      </div>
    </header>
  );
}
