"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";

const api = createNetworkApiClient();
function targetHref(item: any) { if (item.targetType === "post") return `/updates?post=${item.targetId}`; if (item.targetType === "event") return `/events/${item.targetId}`; if (item.targetType === "conversation") return `/messages/${item.targetId}`; if (item.actor?.slug) return `/profile/${item.actor.slug}`; return "/network"; }

export function NotificationsClient() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  async function load() { try { const data = await api.request<any>("/notifications"); setItems(data.notifications); } catch { setError("Notifications could not be loaded."); } }
  useEffect(() => { void load(); }, []);
  async function all() { await api.request("/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) }); setItems((value) => value.map((item) => ({ ...item, read: true }))); }
  async function respond(id: string, action: string) { await api.request(`/connections/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }); setItems((value) => value.filter((item) => item.targetId !== id)); }
  return <main className="app-page max-w-2xl"><div className="flex items-end justify-between"><h1 className="page-heading">Notifications</h1><button onClick={() => void all()} className="text-action">Mark all read</button></div>{error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}<div className="mt-6 border-t border-[var(--divider)]">{items.map((item) => <article key={item.id} className={`border-b border-[var(--divider)] py-4 ${item.read ? "text-[var(--text-muted)]" : ""}`}><Link href={targetHref(item)}>{item.actor?.displayName || "ARTCLUB"} · {item.type.replaceAll("_", " ")}<p className="text-xs text-[var(--text-faint)]">{new Date(item.createdAt).toLocaleString()}</p></Link>{["connection_request", "message_request"].includes(item.type) ? <div className="mt-3 flex gap-2"><button onClick={() => void respond(item.targetId, "accept")} className="primary-action">Accept</button><button onClick={() => void respond(item.targetId, "decline")} className="secondary-action">Decline</button></div> : null}</article>)}</div>{!items.length && !error ? <div className="empty-action py-20 text-center"><p>No notifications yet. Connection requests, messages and event changes will appear here.</p><Link href="/network" className="secondary-action mt-4">Open Network</Link></div> : null}</main>;
}
