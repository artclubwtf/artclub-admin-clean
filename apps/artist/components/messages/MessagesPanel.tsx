"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import { cn } from "@/lib/cn";
import type {
  ArtistMessageConversationDetail,
  ArtistMessageConversationSummary,
} from "@/lib/types";

type MessagesPanelProps = {
  initialConversations: ArtistMessageConversationSummary[];
  initialDetail: ArtistMessageConversationDetail | null;
};

const typeLabels: Record<ArtistMessageConversationSummary["type"], string> = {
  general: "General",
  support: "Support",
  inquiry: "Inquiry",
  exhibition: "Exhibition",
  sales: "Sales",
  logistics: "Logistics",
  request: "Request",
};

function formatListDate(value?: string | Date | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function formatMessageDate(value?: string | Date | null) {
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

function reorderConversations(
  list: ArtistMessageConversationSummary[],
  conversation: ArtistMessageConversationSummary,
) {
  return [conversation, ...list.filter((item) => item.id !== conversation.id)];
}

export function MessagesPanel({ initialConversations, initialDetail }: MessagesPanelProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialDetail?.conversation.id || initialConversations[0]?.id || "");
  const [detail, setDetail] = useState<ArtistMessageConversationDetail | null>(initialDetail);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [createOpen, setCreateOpen] = useState(initialConversations.length === 0);
  const [createSubject, setCreateSubject] = useState("");
  const [createType, setCreateType] = useState<ArtistMessageConversationSummary["type"]>("general");
  const [createText, setCreateText] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || detail?.conversation || null,
    [activeId, conversations, detail],
  );

  async function loadConversation(threadId: string) {
    if (!threadId) return;
    setLoadingConversation(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/artist/messages/${encodeURIComponent(threadId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; conversation?: ArtistMessageConversationDetail["conversation"]; messages?: ArtistMessageConversationDetail["messages"] }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Could not load conversation.");
      }
      setDetail({ conversation: payload.conversation, messages: payload.messages });
      setConversations((current) =>
        current.map((item) =>
          item.id === payload.conversation!.id
            ? { ...item, ...payload.conversation!, unreadCount: 0 }
            : item,
        ),
      );
      await fetch(`/api/artist/messages/${encodeURIComponent(threadId)}/read`, { method: "POST" }).catch(() => null);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not load conversation." });
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    if (!activeId) return;
    if (detail?.conversation.id === activeId) {
      fetch(`/api/artist/messages/${encodeURIComponent(activeId)}/read`, { method: "POST" }).catch(() => null);
      setConversations((current) => current.map((item) => (item.id === activeId ? { ...item, unreadCount: 0 } : item)));
      return;
    }
    void loadConversation(activeId);
  }, [activeId]);

  async function handleCreateConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setSending(true);
    try {
      const res = await fetch("/api/artist/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: createSubject,
          type: createType,
          text: createText,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; conversation?: ArtistMessageConversationDetail["conversation"]; messages?: ArtistMessageConversationDetail["messages"] }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Could not create conversation.");
      }

      const nextDetail: ArtistMessageConversationDetail = {
        conversation: { ...payload.conversation, unreadCount: 0 },
        messages: payload.messages,
      };

      setConversations((current) =>
        reorderConversations(current, {
          id: nextDetail.conversation.id,
          subject: nextDetail.conversation.subject,
          type: nextDetail.conversation.type,
          status: nextDetail.conversation.status,
          lastMessageAt: nextDetail.conversation.lastMessageAt,
          lastMessagePreview: nextDetail.conversation.lastMessagePreview,
          lastMessageSenderRole: nextDetail.conversation.lastMessageSenderRole,
          unreadCount: 0,
          createdAt: nextDetail.conversation.createdAt,
          updatedAt: nextDetail.conversation.updatedAt,
          referenceCount: nextDetail.conversation.referenceCount,
        }),
      );
      setDetail(nextDetail);
      setActiveId(nextDetail.conversation.id);
      setCreateSubject("");
      setCreateType("general");
      setCreateText("");
      setCreateOpen(false);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not create conversation." });
    } finally {
      setSending(false);
    }
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation || !composerText.trim()) return;
    setStatus(null);
    setSending(true);
    try {
      const res = await fetch(`/api/artist/messages/${encodeURIComponent(activeConversation.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: composerText }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; conversation?: ArtistMessageConversationDetail["conversation"]; messages?: ArtistMessageConversationDetail["messages"] }
        | null;
      if (!res.ok || !payload?.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload?.error || "Could not send message.");
      }

      const nextDetail: ArtistMessageConversationDetail = {
        conversation: { ...payload.conversation, unreadCount: 0 },
        messages: payload.messages,
      };
      setDetail(nextDetail);
      setComposerText("");
      setConversations((current) =>
        reorderConversations(current, {
          id: nextDetail.conversation.id,
          subject: nextDetail.conversation.subject,
          type: nextDetail.conversation.type,
          status: nextDetail.conversation.status,
          lastMessageAt: nextDetail.conversation.lastMessageAt,
          lastMessagePreview: nextDetail.conversation.lastMessagePreview,
          lastMessageSenderRole: nextDetail.conversation.lastMessageSenderRole,
          unreadCount: 0,
          createdAt: nextDetail.conversation.createdAt,
          updatedAt: nextDetail.conversation.updatedAt,
          referenceCount: nextDetail.conversation.referenceCount,
        }),
      );
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not send message." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageTitle title="Messages" subtitle="Direct, real conversations between artists and the ARTCLUB team." />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <Section
          title="Conversations"
          subtitle="Real workspace threads connected to your artist account."
          action={
            <Button tone={createOpen ? "secondary" : "primary"} type="button" onClick={() => setCreateOpen((current) => !current)}>
              {createOpen ? "Close" : "New conversation"}
            </Button>
          }
        >
          <div className="space-y-3">
            {createOpen ? (
              <form className="space-y-3 rounded-[1.75rem] bg-neutral-50 p-4" onSubmit={handleCreateConversation}>
                <Input label="Subject" placeholder="What do you need help with?" value={createSubject} onChange={(event) => setCreateSubject(event.target.value)} />
                <label className="block space-y-2">
                  <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">Type</span>
                  <select
                    value={createType}
                    onChange={(event) => setCreateType(event.target.value as ArtistMessageConversationSummary["type"])}
                    className="w-full rounded-3xl bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">First message</span>
                  <textarea
                    value={createText}
                    onChange={(event) => setCreateText(event.target.value)}
                    className="min-h-28 w-full rounded-[1.75rem] bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
                    placeholder="Write your message to ARTCLUB"
                  />
                </label>
                <div className="flex gap-3">
                  <Button type="submit" disabled={sending}>
                    {sending ? "Creating..." : "Start conversation"}
                  </Button>
                  <Button tone="ghost" type="button" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}

            {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

            {conversations.length ? (
              conversations.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    className={cn(
                      "w-full rounded-[1.75rem] px-4 py-4 text-left transition-colors",
                      active ? "bg-neutral-950 text-white" : "bg-neutral-50 text-neutral-950",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className={cn("text-sm font-semibold tracking-[-0.02em]", active ? "text-white" : "text-neutral-950")}>
                          {conversation.subject}
                        </div>
                        <div className={cn("text-xs uppercase tracking-[0.18em]", active ? "text-white/60" : "text-neutral-400")}>
                          {typeLabels[conversation.type]}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {conversation.unreadCount > 0 ? (
                          <span className={cn("min-w-6 rounded-full px-2 py-1 text-[11px] font-semibold", active ? "bg-white text-neutral-950" : "bg-neutral-950 text-white")}>
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                        <span className={cn("text-xs", active ? "text-white/60" : "text-neutral-400")}>
                          {formatListDate(conversation.lastMessageAt)}
                        </span>
                      </div>
                    </div>
                    <p className={cn("mt-2 text-sm leading-6", active ? "text-white/80" : "text-neutral-500")}>
                      {conversation.lastMessagePreview || "No messages yet."}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-5 text-sm leading-6 text-neutral-500">
                No conversations yet. Start one when you want to reach the ARTCLUB team.
              </div>
            )}
          </div>
        </Section>

        <Section
          title={activeConversation ? activeConversation.subject : "Conversation"}
          subtitle={
            activeConversation
              ? `${typeLabels[activeConversation.type]} thread`
              : "Open a conversation to see the message history."
          }
        >
          {loadingConversation ? <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">Loading conversation...</div> : null}

          {!activeConversation && !loadingConversation ? (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-5 text-sm leading-6 text-neutral-500">
              Select a conversation from the list or start a new one.
            </div>
          ) : null}

          {activeConversation && detail ? (
            <div className="space-y-4">
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium text-neutral-950">{activeConversation.subject}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">{typeLabels[activeConversation.type]}</div>
                </div>
                {detail.conversation.references.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.conversation.references.map((reference) => (
                      <span key={`${reference.kind}-${reference.refId}`} className="rounded-full bg-white px-3 py-1 text-xs text-neutral-500">
                        {reference.label || `${reference.kind} ${reference.refId}`}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                {detail.messages.length ? (
                  detail.messages.map((message) => {
                    const isArtist = message.senderRole === "artist";
                    return (
                      <div key={message.id} className={cn("flex", isArtist ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[88%] rounded-[1.75rem] px-4 py-3",
                            isArtist ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-800",
                          )}
                        >
                          <div className={cn("text-xs uppercase tracking-[0.18em]", isArtist ? "text-white/60" : "text-neutral-400")}>
                            {message.senderLabel}
                          </div>
                          {message.text ? <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.text}</div> : null}
                          {message.attachments.length ? (
                            <div className="mt-3 space-y-2">
                              {message.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(
                                    "block rounded-[1.25rem] px-3 py-2 text-sm",
                                    isArtist ? "bg-white/10 text-white" : "bg-white text-neutral-700",
                                  )}
                                >
                                  {attachment.filename}
                                </a>
                              ))}
                            </div>
                          ) : null}
                          <div className={cn("mt-2 text-[11px]", isArtist ? "text-white/60" : "text-neutral-400")}>
                            {formatMessageDate(message.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No messages yet.</div>
                )}
              </div>

              <form className="space-y-3" onSubmit={handleSendMessage}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">Reply</span>
                  <textarea
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                    className="min-h-28 w-full rounded-[1.75rem] bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
                    placeholder="Write a reply"
                  />
                </label>
                <div className="flex gap-3">
                  <Button type="submit" disabled={sending || !composerText.trim()}>
                    {sending ? "Sending..." : "Send"}
                  </Button>
                  <Button tone="ghost" type="button" onClick={() => setComposerText("")}>
                    Clear
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
