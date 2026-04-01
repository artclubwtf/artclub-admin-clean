"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Modal } from "@/components/primitives/Modal";
import { requestJson } from "@/lib/client/request";
import { cn } from "@/lib/cn";
import type {
  ArtistMessageConversationDetail,
  ArtistMessageConversationSummary,
} from "@/lib/types";
import {
  ConversationAvatar,
  formatConversationTime,
  getConversationCounterpartLabel,
  messageTypeLabels,
} from "@/components/messages/message-ui";

type MessagesInboxProps = {
  initialConversations: ArtistMessageConversationSummary[];
};

export function MessagesInbox({ initialConversations }: MessagesInboxProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [modalOpen, setModalOpen] = useState(initialConversations.length === 0);
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<ArtistMessageConversationSummary["type"]>("general");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const aValue = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bValue = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bValue - aValue;
      }),
    [conversations],
  );

  async function handleCreateConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setSubmitting(true);

    try {
      const { response, json } = await requestJson<{
        ok?: boolean;
        error?: string;
        conversation?: ArtistMessageConversationDetail["conversation"];
        messages?: ArtistMessageConversationDetail["messages"];
      }>("/api/artist/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, type, text }),
        retries: 1,
      });

      if (!response.ok || !json?.conversation) {
        throw new Error(json?.error || "Could not create conversation.");
      }

      const createdConversation: ArtistMessageConversationSummary = {
        id: json.conversation.id,
        subject: json.conversation.subject,
        type: json.conversation.type,
        status: json.conversation.status,
        lastMessageAt: json.conversation.lastMessageAt,
        lastMessagePreview: json.conversation.lastMessagePreview,
        lastMessageSenderRole: json.conversation.lastMessageSenderRole,
        unreadCount: 0,
        createdAt: json.conversation.createdAt,
        updatedAt: json.conversation.updatedAt,
        referenceCount: json.conversation.referenceCount,
      };

      setConversations((current) => [createdConversation, ...current.filter((item) => item.id !== createdConversation.id)]);
      setModalOpen(false);
      setSubject("");
      setType("general");
      setText("");
      router.push(`/messages/${encodeURIComponent(createdConversation.id)}`);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not create conversation." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 pt-8">
        <div className="space-y-2">
          <div className="text-[0.68rem] font-medium uppercase tracking-[0.28em] text-neutral-400">ARTCLUB for Artists</div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-neutral-950">Messages</h1>
          <p className="max-w-xl text-sm leading-6 text-neutral-500">Your real conversations with the ARTCLUB team.</p>
        </div>
        <Button type="button" tone="secondary" onClick={() => setModalOpen(true)}>
          New chat
        </Button>
      </div>

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      {sortedConversations.length ? (
        <div className="space-y-2">
          {sortedConversations.map((conversation) => {
            const counterpartLabel = getConversationCounterpartLabel(conversation);
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => router.push(`/messages/${encodeURIComponent(conversation.id)}`)}
                className="flex w-full items-start gap-3 rounded-[1.6rem] px-1 py-3 text-left transition-colors hover:bg-neutral-50"
              >
                <ConversationAvatar label={counterpartLabel} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-neutral-950">{conversation.subject || counterpartLabel}</div>
                      <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">{counterpartLabel}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {conversation.unreadCount > 0 ? <span className="h-2.5 w-2.5 rounded-full bg-neutral-950" aria-hidden /> : null}
                      <span className="text-xs text-neutral-400">{formatConversationTime(conversation.lastMessageAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "truncate text-sm leading-6",
                        conversation.unreadCount > 0 ? "font-medium text-neutral-800" : "text-neutral-500",
                      )}
                    >
                      {conversation.lastMessagePreview || "No messages yet."}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-5 text-sm leading-6 text-neutral-500">
          No conversations yet. Start a new chat when you want to reach the ARTCLUB team.
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Start conversation"
        subtitle="Open a new chat with the ARTCLUB team."
        onClose={() => setModalOpen(false)}
        className="max-w-2xl"
      >
        <form className="space-y-4" onSubmit={handleCreateConversation}>
          <Input label="Subject" placeholder="What do you need help with?" value={subject} onChange={(event) => setSubject(event.target.value)} />
          <label className="block space-y-2">
            <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">Type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ArtistMessageConversationSummary["type"])}
              className="w-full rounded-3xl bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
            >
              {Object.entries(messageTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Textarea label="First message" value={text} onChange={(event) => setText(event.target.value)} placeholder="Write your message" />
          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Start chat"}
            </Button>
            <Button type="button" tone="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
