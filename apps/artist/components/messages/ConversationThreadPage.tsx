"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { requestJson } from "@/lib/client/request";
import type {
  ArtistMessageConversationDetail,
} from "@/lib/types";
import {
  ConversationAvatar,
  MessageBubble,
  getConversationCounterpartLabel,
  messageTypeLabels,
} from "@/components/messages/message-ui";

type ConversationThreadPageProps = {
  initialDetail: ArtistMessageConversationDetail;
};

export function ConversationThreadPage({ initialDetail }: ConversationThreadPageProps) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    void fetch(`/api/artist/messages/${encodeURIComponent(detail.conversation.id)}/read`, { method: "POST" }).catch(() => null);
  }, [detail.conversation.id]);

  async function sendMessage() {
    if (!composerText.trim()) return;

    setStatus(null);
    setSending(true);

    try {
      const { response, json } = await requestJson<{
        ok?: boolean;
        error?: string;
        conversation?: ArtistMessageConversationDetail["conversation"];
        messages?: ArtistMessageConversationDetail["messages"];
      }>(`/api/artist/messages/${encodeURIComponent(detail.conversation.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: composerText }),
        retries: 1,
      });

      if (!response.ok || !json?.conversation || !Array.isArray(json.messages)) {
        throw new Error(json?.error || "Could not send message.");
      }

      setDetail({
        conversation: { ...json.conversation, unreadCount: 0 },
        messages: json.messages,
      });
      setComposerText("");
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Could not send message." });
    } finally {
      setSending(false);
    }
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  const counterpartLabel = getConversationCounterpartLabel(detail.conversation);

  return (
    <div className="space-y-4 pt-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/messages")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
          aria-label="Back to messages"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
            <path d="M14.5 6 8.5 12l6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ConversationAvatar label={counterpartLabel} />
        <div className="min-w-0">
          <h1 className="truncate text-[1.1rem] font-semibold tracking-[-0.03em] text-neutral-950">{detail.conversation.subject || counterpartLabel}</h1>
          <div className="text-sm text-neutral-400">
            {counterpartLabel} · {messageTypeLabels[detail.conversation.type]}
          </div>
        </div>
      </div>

      {detail.conversation.references.length ? (
        <div className="flex flex-wrap gap-2">
          {detail.conversation.references.map((reference) => (
            <span key={`${reference.kind}-${reference.refId}`} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
              {reference.label || `${reference.kind} ${reference.refId}`}
            </span>
          ))}
        </div>
      ) : null}

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      <div className="space-y-3 pb-40 pt-2">
        {detail.messages.length ? (
          detail.messages.map((message) => <MessageBubble key={message.id} message={message} />)
        ) : (
          <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No messages yet.</div>
        )}
      </div>

      <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),1rem)+5.4rem)] z-20 bg-white pb-1 pt-2">
        <form className="space-y-3" onSubmit={handleSendMessage}>
          <label className="block">
            <span className="sr-only">Write a message</span>
            <textarea
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              placeholder="Write a message"
              className="min-h-[3.7rem] w-full resize-y rounded-[1.6rem] bg-neutral-100 px-4 py-3.5 text-[15px] leading-6 text-neutral-950 placeholder:text-neutral-400 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!sending && composerText.trim()) {
                    void sendMessage();
                  }
                }
              }}
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <Link href="/messages" className="text-sm text-neutral-400">
              Back to inbox
            </Link>
            <Button type="submit" disabled={sending || !composerText.trim()}>
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
