import { listAdminWorkspaceConversations, getAdminWorkspaceConversationDetail } from "@/lib/artistWorkspaceMessages";

import AdminMessagesClient from "./AdminMessagesClient";

export default async function AdminMessagesPage() {
  const initialConversations = await listAdminWorkspaceConversations({ filter: "all" });
  const initialDetail = initialConversations[0]
    ? await getAdminWorkspaceConversationDetail({ threadId: initialConversations[0].id })
    : null;

  return (
    <main style={{ padding: 24 }}>
      <AdminMessagesClient
        initialConversations={initialConversations.map((conversation) => ({
          ...conversation,
          lastMessageAt: conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toISOString() : null,
          createdAt: conversation.createdAt ? new Date(conversation.createdAt).toISOString() : null,
          updatedAt: conversation.updatedAt ? new Date(conversation.updatedAt).toISOString() : null,
        }))}
        initialDetail={
          initialDetail
            ? {
                artist: initialDetail.artist,
                conversation: {
                  ...initialDetail.conversation,
                  lastMessageAt: initialDetail.conversation.lastMessageAt ? new Date(initialDetail.conversation.lastMessageAt).toISOString() : null,
                  createdAt: initialDetail.conversation.createdAt ? new Date(initialDetail.conversation.createdAt).toISOString() : null,
                  updatedAt: initialDetail.conversation.updatedAt ? new Date(initialDetail.conversation.updatedAt).toISOString() : null,
                  artistLastReadAt: initialDetail.conversation.artistLastReadAt ? new Date(initialDetail.conversation.artistLastReadAt).toISOString() : null,
                  teamLastReadAt: initialDetail.conversation.teamLastReadAt ? new Date(initialDetail.conversation.teamLastReadAt).toISOString() : null,
                },
                messages: initialDetail.messages.map((message) => ({
                  ...message,
                  createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
                })),
              }
            : null
        }
        initialUnreadConversationCount={initialConversations.filter((conversation) => conversation.unreadCount > 0).length}
      />
    </main>
  );
}
