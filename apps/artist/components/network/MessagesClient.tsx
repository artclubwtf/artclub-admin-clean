"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { ActionIcon } from "@/components/icons/ActionIcon";
import { trackNetwork } from "@/lib/client/network-analytics";

const api = createNetworkApiClient();

function Avatar({ participant, size = "md" }: { participant: any; size?: "sm" | "md" }) {
  const className = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  return participant?.profileImageUrl ? <img src={participant.profileImageUrl} alt="" className={`${className} shrink-0 rounded-full object-cover`}/> : <span className={`${className} grid shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] font-medium`}>{participant?.displayName?.[0] || "·"}</span>;
}

export function InboxClient() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { const data = await api.request<any>(`/conversations?q=${encodeURIComponent(q)}`); setItems(data.conversations); setError(""); } catch { setError("Conversations could not be loaded."); } }, [q]);
  useEffect(() => { void load(); }, [load]);
  return <main className="app-page max-w-6xl"><header><h1 className="page-heading">Messages</h1><p className="meta-text mt-2">Private conversations with your network.</p></header><div className="mt-7 overflow-hidden lg:grid lg:min-h-[36rem] lg:grid-cols-[24rem_1fr] lg:border-t lg:border-[var(--divider)]"><section className="lg:border-r lg:border-[var(--divider)] lg:pr-7"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search conversations" className="control my-5 w-full"/>{error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}<div className="border-t border-[var(--divider)] lg:border-t-0">{items.map((item) => <Link key={item.id} href={`/messages/${item.id}`} onClick={() => trackNetwork("conversation_opened")} className="list-row"><Avatar participant={item.participant}/><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><p className="truncate font-medium">{item.participant?.displayName}</p>{item.lastMessageAt ? <time className="text-xs text-[var(--text-faint)]">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.lastMessageAt))}</time> : null}</div><p className="meta-text truncate">{item.lastMessagePreview || "Start a conversation"}</p></div>{item.unreadCount > 0 ? <span className="status-count">{item.unreadCount}</span> : null}</Link>)}</div>{!items.length && !error ? <div className="empty-action py-16 text-center"><p>Start conversations with people from the art world.</p><Link href="/network" className="secondary-action mt-4">Open Network</Link></div> : null}</section><aside className="hidden place-items-center lg:grid"><div className="max-w-xs text-center"><p className="section-heading">Select a conversation</p><p className="meta-text mt-2">Choose a person on the left to open your messages.</p></div></aside></div></main>;
}

export function ThreadClient({ id }: { id: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [connection, setConnection] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async (cursor?: string) => {
    try {
      const data = await api.request<any>(`/conversations/${id}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      setItems((current) => cursor ? [...data.messages, ...current] : data.messages);
      setParticipant(data.participant);
      setConnection(data.connection);
      setMuted(data.muted === true);
      setNext(data.nextCursor);
      await api.request(`/conversations/${id}/read`, { method: "POST" });
      trackNetwork("message_read");
      setError("");
    } catch { setError("Messages could not be loaded."); }
  }, [id]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10_000); return () => clearInterval(timer); }, [load]);

  async function upload(value: File) {
    const form = new FormData(); form.append("file", value);
    try { const data = await api.request<any>("/upload", { method: "POST", body: form }); setMedia([data.media]); }
    catch { setError("The attachment could not be uploaded."); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    try { const data = await api.request<any>(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ text, media }) }); setItems((value) => [...value, data.message]); setText(""); setMedia([]); trackNetwork("message_sent"); }
    catch { setError("The message could not be sent."); }
  }

  async function toggleMute() {
    try { const data = await api.request<any>(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ action: muted ? "unmute" : "mute" }) }); setMuted(data.muted); setMenuOpen(false); }
    catch { setError("The conversation setting could not be changed."); }
  }

  async function block() {
    if (!connection?.id) return;
    try { await api.request(`/connections/${connection.id}`, { method: "PATCH", body: JSON.stringify({ action: "block" }) }); setConnection({ ...connection, state: "blocked" }); setMenuOpen(false); }
    catch { setError("This profile could not be blocked."); }
  }

  async function report() {
    if (!participant?.id) return;
    try { await api.request("/reports", { method: "POST", body: JSON.stringify({ targetType: "profile", targetId: participant.id, reason: "other", details: "Reported from conversation actions" }) }); setMenuOpen(false); setError("Report received. ARTCLUB will review it."); }
    catch { setError("The report could not be submitted."); }
  }

  return <main className="app-page flex min-h-[calc(100vh-7rem)] max-w-4xl flex-col"><header className="sticky top-14 z-20 -mx-3 flex items-center gap-3 border-b border-[var(--divider)] bg-[var(--background)] px-3 py-3 lg:top-0"><Link href="/messages" aria-label="Back to messages" className="grid h-10 w-10 place-items-center">←</Link><Link href={participant ? `/profile/${participant.slug}` : "/messages"} className="flex min-w-0 flex-1 items-center gap-3"><Avatar participant={participant} size="sm"/><div className="min-w-0"><p className="truncate font-medium">{participant?.displayName || "Conversation"}</p><p className="meta-text truncate">{participant ? `@${participant.username} · ${participant.profileType.replaceAll("_", " ")}${participant.city ? ` · ${participant.city}` : ""}` : "Loading participant"}</p><p className="text-xs capitalize text-[var(--text-faint)]">{connection?.state?.replaceAll("_", " ") || "network contact"}</p></div></Link><div className="relative"><button onClick={() => setMenuOpen((value) => !value)} aria-label="Conversation actions" className="grid h-10 w-10 place-items-center"><ActionIcon name="more"/></button>{menuOpen ? <div className="absolute right-0 top-11 z-30 w-48 rounded-[6px] border border-[var(--divider)] bg-[var(--surface)] p-1"><Link href={`/profile/${participant?.slug}`} className="block rounded-[4px] px-3 py-2 text-sm hover:bg-[var(--surface-soft)]">View profile</Link><button onClick={() => void toggleMute()} className="block w-full rounded-[4px] px-3 py-2 text-left text-sm hover:bg-[var(--surface-soft)]">{muted ? "Unmute" : "Mute"}</button><button onClick={() => void block()} className="block w-full rounded-[4px] px-3 py-2 text-left text-sm hover:bg-[var(--surface-soft)]">Block</button><button onClick={() => void report()} className="block w-full rounded-[4px] px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-soft)]">Report</button></div> : null}</div></header>{next ? <button onClick={() => void load(next)} className="text-action mx-auto my-4">Load earlier messages</button> : null}<div className="flex-1 space-y-3 overflow-y-auto py-6">{items.map((item) => <div key={item.id} className={`flex ${item.mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-[8px] px-4 py-2.5 sm:max-w-[65%] ${item.mine ? "bg-[var(--accent)] text-[var(--accent-text)]" : "bg-[var(--surface-soft)]"}`}>{item.text ? <p className="whitespace-pre-wrap">{item.text}</p> : null}{item.media?.map((medium: any, index: number) => medium.type === "image" ? <img key={index} src={medium.url} alt="Message attachment" className="mt-2 max-h-72 rounded-[6px]"/> : <video key={index} src={medium.url} controls className="mt-2 max-h-72 rounded-[6px]"/>)}<p className="mt-1 text-right text-[10px] opacity-60">{item.mine && item.read ? "Read" : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</p></div></div>)}</div>{error ? <p className={`text-sm ${error.startsWith("Report received") ? "text-[var(--text-muted)]" : "text-[var(--danger)]"}`}>{error}</p> : null}{connection?.state === "blocked" ? <p className="border-t border-[var(--divider)] py-4 text-center text-sm text-[var(--text-muted)]">Messaging is unavailable because this profile is blocked.</p> : <form onSubmit={send} className="sticky bottom-20 mt-4 flex items-center gap-2 rounded-[6px] border border-[var(--divider)] bg-[var(--surface)] p-2 lg:bottom-4"><input ref={file} type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}/><button type="button" onClick={() => file.current?.click()} className="grid h-10 w-10 place-items-center" aria-label="Attach image">+</button><input value={text} onChange={(event) => setText(event.target.value)} placeholder={media.length ? "Image ready" : "Message"} className="min-w-0 flex-1 bg-transparent px-2 outline-none"/><button disabled={!text.trim() && !media.length} className="primary-action disabled:opacity-40">Send</button></form>}</main>;
}
