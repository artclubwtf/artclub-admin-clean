"use client";

import { cn } from "@/lib/cn";
import type {
  ArtistMessageConversationSummary,
  ArtistMessageItem,
} from "@/lib/types";

export const messageTypeLabels: Record<ArtistMessageConversationSummary["type"], string> = {
  general: "General",
  support: "Support",
  inquiry: "Inquiry",
  exhibition: "Exhibition",
  sales: "Sales",
  logistics: "Logistics",
  request: "Request",
};

export function formatConversationTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function formatMessageTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function getConversationCounterpartLabel(conversation: {
  subject: string;
  type: ArtistMessageConversationSummary["type"];
}) {
  return "ARTCLUB Team";
}

export function getConversationAvatarLetters(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "AC";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

export function ConversationAvatar({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-600",
        className,
      )}
      aria-hidden
    >
      {getConversationAvatarLetters(label)}
    </div>
  );
}

export function MessageBubble({ message }: { message: ArtistMessageItem }) {
  const isOutgoing = message.senderRole === "artist";

  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[84%] space-y-2", isOutgoing ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-[1.6rem] px-4 py-3 text-[0.95rem] leading-6",
            isOutgoing ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-900",
          )}
        >
          {message.text ? <div className="whitespace-pre-wrap">{message.text}</div> : null}
          {message.attachments.length ? (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "block rounded-[1rem] px-3 py-2 text-sm",
                    isOutgoing ? "bg-white/10 text-white" : "bg-white text-neutral-700",
                  )}
                >
                  {attachment.filename}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div className={cn("px-1 text-[11px]", isOutgoing ? "text-right text-neutral-400" : "text-neutral-400")}>
          {formatMessageTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
