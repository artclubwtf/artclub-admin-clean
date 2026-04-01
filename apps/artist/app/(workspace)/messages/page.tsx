import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { requireArtistContext } from "@/lib/server/artist-context";
import { ArtistWorkspaceMessageModel, ArtistWorkspaceThreadModel } from "@/lib/server/models";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MessagesPage() {
  const context = await requireArtistContext();

  let thread = await ArtistWorkspaceThreadModel.findOne({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  }).lean();

  if (!thread) {
    const created = await ArtistWorkspaceThreadModel.create({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      userId: context.user._id,
      lastMessageAt: null,
    });
    thread = created.toObject();
  }

  const messages = await ArtistWorkspaceMessageModel.find({ threadId: thread._id }).sort({ createdAt: 1 }).limit(100).lean();

  return (
    <MessagesPanel
      initialMessages={messages.map((item) => ({
        id: item._id.toString(),
        senderRole: item.senderRole,
        text: item.text || "",
        createdAt: item.createdAt,
      }))}
    />
  );
}
