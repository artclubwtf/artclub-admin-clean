"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import ui from "../workspace-ui.module.css";

type Message = {
  id: string;
  senderRole: "artist" | "team";
  text: string;
  mediaIds: string[];
  attachments: Array<{ id: string; url: string; previewUrl: string; filename: string }>;
  createdAt?: string;
};

type MediaItem = { id: string; filename: string; previewUrl: string; url: string };

type Thread = {
  id: string;
  name: string;
  subtitle: string;
  preview: string;
  active?: boolean;
};

function fmtDate(value?: string) {
  if (!value) return "now";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "now" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ArtistsMessagesPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [text, setText] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activeThreadId, setActiveThreadId] = useState("team");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [msgRes, mediaRes] = await Promise.all([
        fetch("/api/artists/v3/messages", { cache: "no-store" }),
        fetch("/api/artists/v2/media", { cache: "no-store" }),
      ]);

      const msgPayload = (await msgRes.json().catch(() => null)) as { messages?: Message[]; error?: string } | null;
      if (!msgRes.ok) throw new Error(msgPayload?.error || "Failed to load messages");

      const mediaPayload = (await mediaRes.json().catch(() => null)) as { media?: MediaItem[] } | null;
      setMessages(Array.isArray(msgPayload?.messages) ? msgPayload?.messages || [] : []);
      setMedia(Array.isArray(mediaPayload?.media) ? mediaPayload?.media || [] : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const threads = useMemo<Thread[]>(() => {
    const latestTeamMessage = messages.slice().reverse().find((item) => item.senderRole === "team");
    const base: Thread[] = [
      {
        id: "team",
        name: "ARTCLUB Team",
        subtitle: "Active",
        preview: latestTeamMessage?.text || "Welcome to ARTCLUB.",
      },
      {
        id: "support",
        name: "Support",
        subtitle: "1 day ago",
        preview: "We resolved your request.",
      },
      {
        id: "curator",
        name: "Gallery Curator",
        subtitle: "3 days ago",
        preview: "Interested in your Urban Series",
      },
    ];

    const q = search.trim().toLowerCase();
    if (q.length === 0) return base;
    return base.filter((item) => item.name.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q));
  }, [messages, search]);

  const visibleMessages = useMemo(() => {
    if (activeThreadId !== "team") return [];
    return messages;
  }, [activeThreadId, messages]);

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (activeThreadId !== "team") return;
    if (text.trim().length === 0 && selectedMediaIds.length === 0) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/artists/v3/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), mediaIds: selectedMediaIds }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to send message");

      setText("");
      setSelectedMediaIds([]);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      {loading ? <div className={ui.muted}>Loading messages...</div> : null}

      {loading === false ? (
        <div className={ui.messagesWrap}>
          <aside className={ui.threadsPane}>
            <div style={{ padding: "12px 12px 0", fontSize: 22, fontWeight: 800, color: "#111111" }}>Messages</div>
            <input
              className={ui.threadSearch}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages..."
            />
            <div className={ui.threadList}>
              {threads.map((thread) => {
                const active = activeThreadId === thread.id;
                const initials = thread.name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part.charAt(0).toUpperCase())
                  .join("");

                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`${ui.threadItem} ${active ? ui.threadItemActive : ""}`.trim()}
                    onClick={() => setActiveThreadId(thread.id)}
                  >
                    <span className={ui.threadAvatar}>{initials}</span>
                    <span>
                      <span className={ui.threadName}>{thread.name}</span>
                      <span className={ui.threadSub} style={{ display: "block" }}>
                        {thread.preview}
                      </span>
                      <span className={ui.threadSub} style={{ display: "block" }}>
                        {thread.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={ui.chatPane}>
            <div className={ui.chatHead}>
              <div className={ui.chatName}>{threads.find((item) => item.id === activeThreadId)?.name || "Messages"}</div>
              <div className={ui.chatState}>{activeThreadId === "team" ? "Active" : "Offline"}</div>
            </div>

            <div className={ui.chatBody}>
              {activeThreadId !== "team" ? <div className={ui.muted}>This thread is read-only in MVP.</div> : null}
              {activeThreadId === "team" && visibleMessages.length === 0 ? <div className={ui.muted}>No messages yet.</div> : null}
              {activeThreadId === "team"
                ? visibleMessages.map((msg) => (
                    <div key={msg.id} className={msg.senderRole === "artist" ? ui.bubbleArtist : ui.bubbleTeam}>
                      <div>{msg.text || "(attachment)"}</div>
                      <div className={ui.bubbleTime}>{fmtDate(msg.createdAt)}</div>
                    </div>
                  ))
                : null}
            </div>

            <form className={ui.chatComposer} onSubmit={onSend}>
              <button
                className="btnGhost"
                type="button"
                onClick={() => {
                  const first = media[0]?.id;
                  if (!first) return;
                  setSelectedMediaIds((prev) => (prev.includes(first) ? [] : [first]));
                }}
                disabled={activeThreadId !== "team"}
              >
                📎
              </button>
              <input
                className={ui.chatInput}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message..."
                disabled={activeThreadId !== "team"}
              />
              <button className="btnPrimary" type="submit" disabled={sending || activeThreadId !== "team"}>
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
