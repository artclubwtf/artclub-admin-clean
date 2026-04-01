"use client";

import { useEffect, useMemo, useState } from "react";

import type { WorkspaceConversationType } from "@artclub/models";

type ConversationSummary = {
  id: string;
  subject: string;
  type: WorkspaceConversationType;
  status: "open" | "archived";
  lastMessageAt?: string | null;
  lastMessagePreview: string;
  unreadCount: number;
};

type ConversationDetail = {
  conversation: ConversationSummary & {
    references: Array<{ kind: string; refId: string; label?: string }>;
  };
  messages: Array<{
    id: string;
    senderRole: "artist" | "team";
    senderLabel: string;
    text: string;
    attachments: Array<{ id: string; filename: string; url: string }>;
    createdAt?: string | null;
  }>;
};

type Props = {
  artistId: string;
};

const typeLabels: Record<WorkspaceConversationType, string> = {
  general: "General",
  support: "Support",
  inquiry: "Inquiry",
  exhibition: "Exhibition",
  sales: "Sales",
  logistics: "Logistics",
  request: "Request",
};

function formatListDate(value?: string | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function formatMessageDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toSummary(conversation: ConversationDetail["conversation"]): ConversationSummary {
  return {
    id: conversation.id,
    subject: conversation.subject,
    type: conversation.type,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt || null,
    lastMessagePreview: conversation.lastMessagePreview || "",
    unreadCount: 0,
  };
}

export default function ArtistWorkspaceMessagesPanel({ artistId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubject, setCreateSubject] = useState("");
  const [createType, setCreateType] = useState<WorkspaceConversationType>("general");
  const [createText, setCreateText] = useState("");

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || detail?.conversation || null,
    [activeId, conversations, detail],
  );

  async function loadConversations() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/artists/${encodeURIComponent(artistId)}/messages`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { conversations?: ConversationSummary[]; error?: string }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load conversations");
      const next = Array.isArray(payload?.conversations) ? payload.conversations : [];
      setConversations(next);
      setActiveId((current) => current || next[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(threadId: string) {
    if (!threadId) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/artists/${encodeURIComponent(artistId)}/messages/${encodeURIComponent(threadId)}`, {
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as
        | { conversation?: ConversationDetail["conversation"]; messages?: ConversationDetail["messages"]; error?: string }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Failed to load conversation");
      }
      setDetail({ conversation: payload.conversation, messages: payload.messages });
      setConversations((current) => current.map((item) => (item.id === threadId ? { ...item, ...payload.conversation!, unreadCount: 0 } : item)));
      await fetch(`/api/admin/artists/${encodeURIComponent(artistId)}/messages/${encodeURIComponent(threadId)}/read`, {
        method: "POST",
      }).catch(() => null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    }
  }

  useEffect(() => {
    void loadConversations();
  }, [artistId]);

  useEffect(() => {
    if (!activeId) return;
    if (detail?.conversation.id === activeId) {
      setConversations((current) => current.map((item) => (item.id === activeId ? { ...item, unreadCount: 0 } : item)));
      return;
    }
    void loadDetail(activeId);
  }, [activeId]);

  async function handleReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/artists/${encodeURIComponent(artistId)}/messages/${encodeURIComponent(activeConversation.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: replyText }),
        },
      );
      const payload = (await res.json().catch(() => null)) as
        | { conversation?: ConversationDetail["conversation"]; messages?: ConversationDetail["messages"]; error?: string }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Failed to send reply");
      }

      setDetail({ conversation: payload.conversation, messages: payload.messages });
      const nextSummary = toSummary(payload.conversation);
      setConversations((current) => [nextSummary, ...current.filter((item) => item.id !== nextSummary.id)]);
      setReplyText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/artists/${encodeURIComponent(artistId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: createSubject,
          type: createType,
          text: createText,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { conversation?: ConversationDetail["conversation"]; messages?: ConversationDetail["messages"]; error?: string }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Failed to create conversation");
      }
      setDetail({ conversation: payload.conversation, messages: payload.messages });
      const nextSummary = toSummary(payload.conversation);
      setConversations((current) => [nextSummary, ...current.filter((item) => item.id !== nextSummary.id)]);
      setActiveId(nextSummary.id);
      setCreateOpen(false);
      setCreateSubject("");
      setCreateType("general");
      setCreateText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="ac-card flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold text-slate-800">Messages</div>
          <div className="text-xs text-slate-500">Shared artist workspace conversations on the new thread model.</div>
        </div>
        <button type="button" className="btnPrimary" onClick={() => setCreateOpen((current) => !current)}>
          {createOpen ? "Close" : "New conversation"}
        </button>
      </div>

      {error ? <div className="ac-card text-sm text-red-600">Error: {error}</div> : null}
      {loading ? <div className="ac-card text-sm text-slate-600">Loading conversations...</div> : null}

      {createOpen ? (
        <form className="ac-card space-y-3" onSubmit={handleCreate}>
          <label className="field">
            <span>Subject</span>
            <input value={createSubject} onChange={(event) => setCreateSubject(event.target.value)} placeholder="Subject" />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={createType} onChange={(event) => setCreateType(event.target.value as WorkspaceConversationType)}>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>First message</span>
            <textarea value={createText} onChange={(event) => setCreateText(event.target.value)} rows={4} placeholder="Type the first message..." />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btnPrimary" disabled={sending}>
              {sending ? "Creating..." : "Start conversation"}
            </button>
            <button type="button" className="btnGhost" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="ac-card space-y-2">
          {conversations.length === 0 && !loading ? <div className="text-sm text-slate-600">No conversations yet.</div> : null}
          {conversations.map((conversation) => {
            const active = conversation.id === activeId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={`w-full rounded-xl px-3 py-3 text-left ${active ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-900"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{conversation.subject}</div>
                    <div className={`text-[11px] uppercase tracking-[0.18em] ${active ? "text-white/60" : "text-slate-400"}`}>
                      {typeLabels[conversation.type]}
                    </div>
                  </div>
                  <div className="text-right">
                    {conversation.unreadCount > 0 ? (
                      <div className={`inline-flex min-w-6 rounded-full px-2 py-1 text-[11px] font-semibold ${active ? "bg-white text-slate-900" : "bg-slate-900 text-white"}`}>
                        {conversation.unreadCount}
                      </div>
                    ) : null}
                    <div className={`mt-1 text-[11px] ${active ? "text-white/60" : "text-slate-400"}`}>{formatListDate(conversation.lastMessageAt)}</div>
                  </div>
                </div>
                <div className={`mt-2 text-sm ${active ? "text-white/80" : "text-slate-500"}`}>{conversation.lastMessagePreview || "No messages yet."}</div>
              </button>
            );
          })}
        </div>

        <div className="ac-card space-y-3">
          {!activeConversation ? <div className="text-sm text-slate-600">Select a conversation to view its history.</div> : null}
          {activeConversation && detail ? (
            <>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-slate-900">{activeConversation.subject}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{typeLabels[activeConversation.type]}</div>
              </div>

              <div className="space-y-3" style={{ maxHeight: 420, overflowY: "auto" }}>
                {detail.messages.length === 0 ? <div className="text-sm text-slate-600">No messages yet.</div> : null}
                {detail.messages.map((message) => {
                  const isTeam = message.senderRole === "team";
                  return (
                    <div key={message.id} className={`flex ${isTeam ? "justify-end" : "justify-start"}`}>
                      <div
                        className="rounded-2xl px-3 py-2"
                        style={{
                          background: isTeam ? "var(--primary)" : "color-mix(in srgb, var(--surface2) 92%, transparent)",
                          color: isTeam ? "var(--primaryText)" : "var(--text)",
                          maxWidth: "80%",
                        }}
                      >
                        <div className="text-[11px] uppercase tracking-[0.18em] opacity-70">{message.senderLabel}</div>
                        {message.text ? <div className="mt-2 text-sm whitespace-pre-wrap">{message.text}</div> : null}
                        {message.attachments.length ? (
                          <div className="mt-2 space-y-1">
                            {message.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded bg-white/20 px-2 py-1 text-xs underline"
                              >
                                {attachment.filename}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-1 text-[10px] opacity-70">{formatMessageDate(message.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="space-y-2" onSubmit={handleReply}>
                <label className="field">
                  <span>Reply</span>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    rows={3}
                    placeholder="Type a message to the artist..."
                  />
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="btnPrimary" disabled={sending || !replyText.trim()}>
                    {sending ? "Sending..." : "Send"}
                  </button>
                  <button type="button" className="btnGhost" onClick={() => setReplyText("")}>
                    Clear
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
