"use client";

import { FormEvent, useEffect, useState } from "react";

import EmptyState from "@/app/artists/_components/EmptyState";
import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type Message = {
  id: string;
  senderRole: "artist" | "team";
  text: string;
  mediaIds: string[];
  attachments: Array<{ id: string; url: string; previewUrl: string; filename: string }>;
  createdAt?: string;
};

type MediaItem = { id: string; filename: string; previewUrl: string; url: string };

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export default function ArtistsMessagesPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [text, setText] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);

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
      setMessages(Array.isArray(msgPayload?.messages) ? msgPayload!.messages : []);
      setMedia(Array.isArray(mediaPayload?.media) ? mediaPayload!.media : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && selectedMediaIds.length === 0) return;

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
    <PageShell title="Messages" subtitle="Direct channel with the Artclub team">
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <SectionCard title="New message" subtitle="Send text and optional attachments from your media library">
        <form className="grid gap-3" onSubmit={onSend}>
          <label className="field">
            Message
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to the team…" />
          </label>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {media.slice(0, 20).map((item) => {
              const selected = selectedMediaIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setSelectedMediaIds((prev) =>
                      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
                    )
                  }
                  className={`rounded border p-1 ${selected ? "border-slate-900" : "border-slate-200"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl || item.url} alt={item.filename} className="h-20 w-full rounded object-cover" />
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button className="btnPrimary" type="submit" disabled={sending}>
              {sending ? "Sending..." : "Send message"}
            </button>
          </div>
        </form>
      </SectionCard>

      {loading ? <div className="text-sm text-slate-600">Loading thread…</div> : null}

      {!loading && messages.length === 0 ? (
        <EmptyState title="No messages yet" description="Start your first conversation with the Artclub team." />
      ) : null}

      {!loading && messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-500">{msg.senderRole.toUpperCase()}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{msg.text || "(attachment)"}</div>
              {msg.attachments?.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {msg.attachments.map((att) => (
                    <div key={att.id} className="overflow-hidden rounded border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={att.previewUrl || att.url} alt={att.filename} className="h-20 w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-slate-500">{fmtDate(msg.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
