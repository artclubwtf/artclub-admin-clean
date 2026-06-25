"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

type ArtistSummary = {
  canonicalArtistId: string | null;
  artistUserId: string | null;
  artistKey: string;
  artistName: string;
  artistAvatarUrl: string | null;
  artistEmail: string | null;
  shopDomain: string;
};

type ConversationSummary = {
  id: string;
  subject: string;
  type: "general" | "support" | "inquiry" | "exhibition" | "sales" | "logistics" | "request";
  status: "open" | "archived";
  lastMessageAt?: string | null;
  lastMessagePreview: string;
  lastMessageSenderRole?: "artist" | "team" | null;
  unreadCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  referenceCount: number;
  artist: ArtistSummary;
};

type ConversationCore = Omit<ConversationSummary, "artist">;

type ConversationDetail = {
  artist: ArtistSummary;
  conversation: ConversationCore & {
    artistLastReadAt?: string | null;
    teamLastReadAt?: string | null;
    references: Array<{ kind: string; refId: string; label?: string }>;
  };
  messages: Array<{
    id: string;
    senderRole: "artist" | "team";
    senderLabel: string;
    text: string;
    attachments: Array<{ id: string; filename: string; mimeType: string; kind: string; url: string; previewUrl: string }>;
    createdAt?: string | null;
  }>;
};

type Props = {
  initialConversations: ConversationSummary[];
  initialDetail: ConversationDetail | null;
  initialUnreadConversationCount: number;
};

const filterItems: Array<{ key: "all" | "unread" | "archived"; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "archived", label: "Archived" },
];

const typeLabels: Record<ConversationSummary["type"], string> = {
  general: "General",
  support: "Support",
  inquiry: "Inquiry",
  exhibition: "Exhibition",
  sales: "Sales",
  logistics: "Logistics",
  request: "Request",
};

function formatListTime(value?: string | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function formatMessageTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "AC";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function moveConversationToTop(list: ConversationSummary[], summary: ConversationSummary) {
  return [summary, ...list.filter((item) => item.id !== summary.id)];
}

export default function AdminMessagesClient({ initialConversations, initialDetail, initialUnreadConversationCount }: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const [detail, setDetail] = useState<ConversationDetail | null>(initialDetail);
  const [activeId, setActiveId] = useState(initialDetail?.conversation.id || initialConversations[0]?.id || "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  const [replyText, setReplyText] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [unreadConversationCount, setUnreadConversationCount] = useState(initialUnreadConversationCount);

  const deferredQuery = useDeferredValue(query);
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || null,
    [activeId, conversations],
  );
  const activeArtist = detail?.conversation.id === activeId ? detail.artist : activeConversation?.artist || null;

  async function loadConversations(options?: { silent?: boolean }) {
    if (!options?.silent) setLoadingList(true);
    try {
      const search = new URLSearchParams();
      if (deferredQuery.trim()) search.set("q", deferredQuery.trim());
      search.set("filter", filter);
      const res = await fetch(`/api/admin/messages?${search.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; conversations?: ConversationSummary[]; unreadConversationCount?: number }
        | null;
      if (!res.ok || !Array.isArray(payload?.conversations)) {
        throw new Error(payload?.error || "Could not load conversations.");
      }

      const nextConversations = payload.conversations;
      setConversations(nextConversations);
      setUnreadConversationCount(typeof payload.unreadConversationCount === "number" ? payload.unreadConversationCount : 0);
      setActiveId((current) => {
        if (current && nextConversations.some((item) => item.id === current)) return current;
        return nextConversations[0]?.id || "";
      });
      if (nextConversations.length === 0) {
        setDetail(null);
      }
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not load conversations." });
    } finally {
      if (!options?.silent) setLoadingList(false);
    }
  }

  async function markConversationRead(threadId: string) {
    const hadUnread = conversations.find((item) => item.id === threadId)?.unreadCount || 0;
    await fetch(`/api/admin/messages/${encodeURIComponent(threadId)}/read`, { method: "POST" }).catch(() => null);
    if (hadUnread > 0) {
      setUnreadConversationCount((current) => Math.max(0, current - 1));
      setConversations((current) => current.map((item) => (item.id === threadId ? { ...item, unreadCount: 0 } : item)));
    }
  }

  async function loadDetail(threadId: string, options?: { silent?: boolean }) {
    if (!threadId) return;
    if (!options?.silent) setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(threadId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; conversation?: ConversationDetail["conversation"]; messages?: ConversationDetail["messages"]; artist?: ArtistSummary }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages) || !payload.artist) {
        throw new Error(payload?.error || "Could not load conversation.");
      }

      const nextDetail = {
        artist: payload.artist,
        conversation: payload.conversation,
        messages: payload.messages,
      } satisfies ConversationDetail;

      setDetail(nextDetail);
      setConversations((current) =>
        current.map((item) => (item.id === threadId ? { ...item, ...payload.conversation!, artist: payload.artist!, unreadCount: 0 } : item)),
      );
      await markConversationRead(threadId);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not load conversation." });
    } finally {
      if (!options?.silent) setLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadConversations();
  }, [deferredQuery, filter]);

  useEffect(() => {
    if (!activeId) return;
    if (detail?.conversation.id === activeId) {
      void markConversationRead(activeId);
      return;
    }
    void loadDetail(activeId);
  }, [activeId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadConversations({ silent: true });
      if (activeId) void loadDetail(activeId, { silent: true });
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [activeId, deferredQuery, filter]);

  async function handleReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation || !activeArtist || !replyText.trim()) return;

    setSending(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(activeConversation.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; conversation?: ConversationDetail["conversation"]; messages?: ConversationDetail["messages"] }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error("Message could not be sent. Please try again.");
      }

      const nextDetail = {
        artist: detail?.artist || activeArtist,
        conversation: payload.conversation,
        messages: payload.messages,
      };
      setDetail(nextDetail);
      setConversations((current) =>
        moveConversationToTop(
          current,
          {
            ...activeConversation,
            ...payload.conversation,
            artist: activeArtist,
            unreadCount: 0,
          },
        ),
      );
      setReplyText("");
      setStatus({ tone: "success", text: "Sent" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Message could not be sent. Please try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-900">Messages</h1>
          <p className="text-sm text-slate-500">Inbox for all artist conversations with the ARTCLUB team.</p>
        </div>
        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
          {unreadConversationCount} unread
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search artist or message..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
            <div className="flex flex-wrap gap-2">
              {filterItems.map((item) => {
                const active = filter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loadingList ? <div className="text-sm text-slate-500">Loading conversations...</div> : null}
            {!loadingList && conversations.length === 0 ? <div className="text-sm text-slate-500">No conversations found.</div> : null}
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    setStatus(null);
                    setActiveId(conversation.id);
                  }}
                  className={`flex w-full items-start gap-3 rounded-3xl border px-3 py-3 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`}
                >
                  {conversation.artist.artistAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={conversation.artist.artistAvatarUrl} alt={conversation.artist.artistName} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold uppercase tracking-[0.16em] ${active ? "bg-white/15 text-white" : "bg-white text-slate-600"}`}>
                      {getInitials(conversation.artist.artistName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{conversation.artist.artistName}</div>
                        <div className={`truncate text-[11px] uppercase tracking-[0.18em] ${active ? "text-white/65" : "text-slate-400"}`}>
                          {typeLabels[conversation.type]}
                        </div>
                      </div>
                      <div className="text-right">
                        {conversation.unreadCount > 0 ? (
                          <div className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold ${active ? "bg-white text-slate-900" : "bg-slate-900 text-white"}`}>
                            {conversation.unreadCount}
                          </div>
                        ) : null}
                        <div className={`mt-1 text-[11px] ${active ? "text-white/65" : "text-slate-400"}`}>{formatListTime(conversation.lastMessageAt)}</div>
                      </div>
                    </div>
                    <div className={`mt-2 truncate text-sm ${active ? "text-white/85" : "text-slate-500"}`}>
                      {conversation.lastMessagePreview || "No messages yet."}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {!activeConversation ? <div className="text-sm text-slate-500">Select a conversation to view the thread.</div> : null}
          {activeConversation && activeArtist ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-900">{activeArtist.artistName}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                      {typeLabels[activeConversation.type]}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">{activeConversation.subject}</div>
                  {activeArtist.artistEmail ? <div className="text-sm text-slate-400">{activeArtist.artistEmail}</div> : null}
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/artists-v2/${encodeURIComponent(activeArtist.artistKey)}`} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                    Open artist
                  </Link>
                </div>
              </div>

              {status ? (
                <div className={`rounded-2xl px-4 py-3 text-sm ${status.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {status.text}
                </div>
              ) : null}

              {loadingDetail ? <div className="text-sm text-slate-500">Loading conversation...</div> : null}
              {detail && detail.conversation.id === activeConversation.id ? (
                <>
                  <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 520 }}>
                    {detail.messages.length === 0 ? <div className="text-sm text-slate-500">No messages yet.</div> : null}
                    {detail.messages.map((message) => {
                      const isTeam = message.senderRole === "team";
                      return (
                        <div key={message.id} className={`flex ${isTeam ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[82%] space-y-2">
                            <div className={`rounded-[1.6rem] px-4 py-3 text-sm leading-6 ${isTeam ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
                              <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isTeam ? "text-white/70" : "text-slate-500"}`}>
                                {isTeam ? "ARTCLUB Team" : activeArtist.artistName}
                              </div>
                              {message.text ? <div className="mt-2 whitespace-pre-wrap">{message.text}</div> : null}
                              {message.attachments.length ? (
                                <div className="mt-2 space-y-2">
                                  {message.attachments.map((attachment) => (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`block rounded-2xl px-3 py-2 text-sm ${isTeam ? "bg-white/10 text-white" : "bg-white text-slate-700"}`}
                                    >
                                      {attachment.filename}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className={`px-1 text-[11px] ${isTeam ? "text-right text-slate-400" : "text-slate-400"}`}>{formatMessageTime(message.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form className="space-y-3 border-t border-slate-100 pt-4" onSubmit={handleReply}>
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      rows={4}
                      placeholder="Write a reply to the artist..."
                      className="w-full rounded-3xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-400">Replies are shown to artists as ARTCLUB Team.</div>
                      <button
                        type="submit"
                        disabled={sending || !replyText.trim()}
                        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
