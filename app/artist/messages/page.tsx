"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageTitle } from "@/components/ui/PageTitle";
import { FilePreview } from "@/components/ui/FilePreview";
import { ApSection, ApSectionHeader } from "@/components/artist/ApElements";

type MediaItem = {
  id: string;
  filename?: string;
  url?: string;
  mimeType?: string;
  kind?: string;
};

type Message = {
  id: string;
  senderRole: "artist" | "team";
  text?: string;
  mediaIds: string[];
  attachments: MediaItem[];
  createdAt?: string;
};

export default function ArtistMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [availableMedia, setAvailableMedia] = useState<MediaItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [msgRes, mediaRes] = await Promise.all([
        fetch("/api/artist/messages", { cache: "no-store" }),
        fetch("/api/artist/media", { cache: "no-store" }),
      ]);
      const msgPayload = (await msgRes.json().catch(() => null)) as { messages?: Message[]; error?: string } | null;
      const mediaPayload = (await mediaRes.json().catch(() => null)) as { media?: MediaItem[]; error?: string } | null;
      if (!msgRes.ok) throw new Error(msgPayload?.error || "Failed to load messages");
      if (!mediaRes.ok) throw new Error(mediaPayload?.error || "Failed to load media");
      setMessages(Array.isArray(msgPayload?.messages) ? msgPayload.messages : []);
      setAvailableMedia(Array.isArray(mediaPayload?.media) ? mediaPayload.media : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleMedia = (id: string) => {
    setSelectedMediaIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const selectedMedia = useMemo(
    () => availableMedia.filter((m) => selectedMediaIds.includes(m.id)),
    [availableMedia, selectedMediaIds],
  );

  const handleSend = async () => {
    if (!text.trim() && selectedMediaIds.length === 0) {
      setError("Please enter a message or attach a file.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mediaIds: selectedMediaIds }),
      });
      const payload = (await res.json().catch(() => null)) as { message?: Message; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to send");
      if (payload?.message?.id) {
        const newMessage: Message = {
          id: payload.message.id,
          senderRole: payload.message.senderRole,
          text: payload.message.text,
          mediaIds: payload.message.mediaIds || [],
          attachments: selectedMedia,
          createdAt: payload.message.createdAt,
        };
        setMessages((prev) => [...prev, newMessage]);
      }
      setText("");
      setSelectedMediaIds([]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (date?: string) => (date ? new Date(date).toLocaleString() : "");

  return (
    <div className="space-y-4">
      <PageTitle title="Messages" description="Chat with the Artclub team. Attach files from your media." />

      <ApSection>
        <ApSectionHeader title="Conversation" subtitle="Stay in touch with the team." />

        {error && <div className="ap-note">Error: {error}</div>}
        {loading && <div className="ap-note">Loading messages...</div>}

        <div className="ap-chat-shell">
          <div className="ap-chat-thread">
            {messages.length === 0 && !loading ? (
              <div className="ap-empty-row">No messages yet. Say hello or ask a question.</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`ap-chat-row ${m.senderRole === "artist" ? "justify-end" : "justify-start"}`}>
                  <div className="ap-chat-bubble" data-role={m.senderRole}>
                    {m.text && <div className="text-sm whitespace-pre-wrap">{m.text}</div>}
                    {m.attachments?.length ? (
                      <div className="mt-2 space-y-1">
                        {m.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.url || "#"}
                            target={att.url ? "_blank" : undefined}
                            rel="noreferrer"
                            className="block rounded border bg-transparent px-2 py-1 text-xs underline"
                            style={{ borderColor: "var(--ap-border)" }}
                          >
                            {att.mimeType || "File"} · {att.filename || att.id}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    <div className="ap-chat-meta">{formatTime(m.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="ap-composer">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Type your message..."
            />

            <div className="space-y-2">
              <div className="ap-section-title" style={{ fontSize: 14 }}>
                Attach from your media
              </div>
              <div className="ap-grid">
                {availableMedia.map((m) => {
                  const checked = selectedMediaIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMedia(m.id)}
                      className={`ap-media-tile${checked ? " selected" : ""}`}
                      style={{ alignItems: "flex-start" }}
                    >
                      <div className="ap-media-thumb" style={{ height: 100 }}>
                        <FilePreview mimeType={m.mimeType} url={m.url} filename={m.filename || "media"} height={100} />
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{m.filename || "Untitled"}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedMedia.length > 0 && <div className="ap-note">Attachments: {selectedMedia.length} selected</div>}

            <div className="ap-composer-actions">
              <button type="button" className="ap-btn" onClick={handleSend} disabled={sending}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </ApSection>
    </div>
  );
}
