"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
      if (payload?.message) {
        setMessages((prev) => [...prev, { ...payload.message, attachments: selectedMedia }]);
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

  const isImage = (mime?: string) => (mime || "").startsWith("image/");

  return (
    <div className="space-y-4">
      <div className="artist-card space-y-1">
        <div className="artist-section-title">Messages</div>
        <div className="artist-section-sub">Chat with the Artclub team. Attach files from your media.</div>
      </div>

      {error && <div className="artist-card artist-placeholder">Error: {error}</div>}
      {loading && <div className="artist-card artist-placeholder">Loading messages...</div>}

      <div className="artist-card space-y-3" style={{ maxHeight: 520, overflowY: "auto" }}>
        {messages.length === 0 && !loading ? (
          <div className="artist-placeholder">No messages yet. Say hello!</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.senderRole === "artist" ? "justify-end" : "justify-start"}`}
            >
              <div
                className="rounded-2xl px-3 py-2 shadow-sm"
                style={{
                  background: m.senderRole === "artist" ? "var(--accent)" : "color-mix(in srgb, var(--surface) 92%, transparent)",
                  color: m.senderRole === "artist" ? "#fff" : "var(--text)",
                  maxWidth: "82%",
                }}
              >
                {m.text && <div className="text-sm whitespace-pre-wrap">{m.text}</div>}
                {m.attachments?.length ? (
                  <div className="mt-2 space-y-1">
                    {m.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={att.url || "#"}
                        target={att.url ? "_blank" : undefined}
                        rel="noreferrer"
                        className="block rounded bg-white/20 px-2 py-1 text-xs underline"
                      >
                        {isImage(att.mimeType) ? "Image" : att.mimeType || "File"} · {att.filename || att.id}
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="mt-1 text-[10px] opacity-70">{formatTime(m.createdAt)}</div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="artist-card space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder="Type your message..."
        />

        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-600">Attach from your media</div>
          <div className="artist-grid">
            {availableMedia.map((m) => {
              const checked = selectedMediaIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMedia(m.id)}
                  className={`artist-media-card ${checked ? "ring-2 ring-slate-900" : ""}`}
                  style={{ alignItems: "flex-start" }}
                >
                  <div className="artist-media-preview" style={{ height: 100 }}>
                    {isImage(m.mimeType) && m.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.filename || "media"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-xs text-slate-500">{m.filename || m.id}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{m.filename || "Untitled"}</div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedMedia.length > 0 && (
          <div className="artist-placeholder">Attachments: {selectedMedia.length} selected</div>
        )}

        <button type="button" className="artist-btn" onClick={handleSend} disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
