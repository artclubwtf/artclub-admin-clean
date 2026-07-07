"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { ImageUpload, type ImageUploadItem } from "@/components/forms/ImageUpload";
import { trackNetwork } from "@/lib/client/network-analytics";

const api = createNetworkApiClient();

export function EventsClient({ canCreate }: { canCreate: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [when, setWhen] = useState("upcoming");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.request<any>(`/events?when=${when}`)
      .then(data => { setItems(data.events); setError(""); })
      .catch(reason => setError(reason.message))
      .finally(() => setLoading(false));
  }, [when]);

  async function rsvp(item: any) {
    const previous = items;
    setItems(value => value.map(event => event.id === item.id ? { ...event, attending: !event.attending, rsvpCount: Math.max(0, event.rsvpCount + (event.attending ? -1 : 1)) } : event));
    try {
      const data = await api.request<any>(`/events/${item.id}/rsvp`, { method: item.attending ? "DELETE" : "POST" });
      setItems(value => value.map(event => event.id === item.id ? { ...event, ...data } : event));
      trackNetwork(item.attending ? "event_rsvp_removed" : "event_rsvp", { eventId: item.id });
    } catch (reason: any) {
      setItems(previous);
      setError(reason.message);
    }
  }

  return <div className="mx-auto max-w-4xl py-6"><div className="flex items-end justify-between"><div><p className="eyebrow">Around you</p><h1 className="page-heading">Events</h1></div>{canCreate && <Link href="/events/new" className="primary-action">Create event</Link>}</div><div className="quiet-tabs mt-6">{["upcoming", "past"].map(value => <button key={value} onClick={() => setWhen(value)} className="quiet-tab capitalize" aria-selected={when === value}>{value}</button>)}</div>{error && <p className="mt-4 text-[var(--danger)]">{error}</p>}{loading ? <div className="mt-7 grid gap-7 sm:grid-cols-2">{[1, 2, 3, 4].map(value => <div key={value} className="h-72 animate-pulse rounded-2xl bg-[var(--surface-soft)]" />)}</div> : <div className="mt-7 grid gap-7 sm:grid-cols-2">{items.map(item => <article key={item.id}>{item.coverImageUrl ? <img src={item.coverImageUrl} alt={item.title} className="aspect-[16/10] w-full rounded-2xl object-cover" /> : <div className="aspect-[16/10] rounded-2xl bg-[var(--surface-soft)]" />}<p className="meta-text mt-3">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: item.timezone }).format(new Date(item.startAt))} · {item.city || item.venueName || (item.isOnline ? "Online" : "")}</p><div className="flex items-start justify-between gap-3"><Link href={`/events/${item.id}`} className="text-xl font-medium">{item.title}</Link>{item.status === "cancelled" && <span className="text-xs text-red-600">Cancelled</span>}</div><div className="mt-3 flex items-center gap-3"><button disabled={!['available', 'attending'].includes(item.rsvpState)} onClick={() => void rsvp(item)} className="secondary-action disabled:opacity-40">{item.attending ? "Going" : item.rsvpState === "full" ? "Full" : "RSVP"}</button><span className="meta-text">{item.rsvpCount} going</span></div></article>)}</div>}{!loading && !items.length && !error && <p className="py-20 text-center text-[var(--text-faint)]">No {when} events yet.</p>}</div>;
}

type FormValue = { title: string; description: string; coverImageUrl: string; startAt: string; endAt: string; timezone: string; venueName: string; address: string; city: string; country: string; isOnline: boolean; ticketUrl: string; rsvpEnabled: boolean; capacity: string; visibility: string; participantProfileIds: string[]; status: "draft" | "published" };
const empty: FormValue = { title: "", description: "", coverImageUrl: "", startAt: "", endAt: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, venueName: "", address: "", city: "", country: "", isOnline: false, ticketUrl: "", rsvpEnabled: true, capacity: "", visibility: "public", participantProfileIds: [], status: "draft" };
function localValue(value?: string) { if (!value) return ""; const date = new Date(value); const pad = (number: number) => String(number).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }

export function EventFormClient({ initial, eventId }: { initial?: any; eventId?: string }) {
  const [value, setValue] = useState<FormValue>(() => initial ? { ...empty, ...initial, startAt: localValue(initial.startAt), endAt: localValue(initial.endAt), capacity: initial.capacity ? String(initial.capacity) : "" } : empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const coverItems: ImageUploadItem[] = value.coverImageUrl ? [{ url: value.coverImageUrl }] : [];

  async function submit(event: FormEvent, status: "draft" | "published") {
    event.preventDefault();
    if (busy || uploading) return;
    setBusy(true); setError("");
    try {
      const body = { ...value, status, capacity: value.capacity ? Number(value.capacity) : undefined };
      const data = await api.request<any>(eventId ? `/events/${eventId}` : "/events", { method: eventId ? "PATCH" : "POST", body: JSON.stringify(body) });
      trackNetwork(eventId ? "event_edit" : status === "published" ? "event_published" : "event_created", { eventId: data.event.id });
      location.href = `/events/${data.event.id}`;
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(false); }
  }

  const field = (key: keyof FormValue, label: string, type = "text") => <label className="block"><span className="mb-1 block text-sm">{label}</span><input disabled={busy || uploading} type={type} value={String(value[key] || "")} onChange={event => setValue({ ...value, [key]: event.target.value })} className="control w-full" /></label>;
  return <form className="mx-auto max-w-2xl space-y-4 py-7"><h1 className="page-heading">{eventId ? "Edit event" : "Create an event"}</h1><ImageUpload label="Event cover" variant="event-cover" items={coverItems} onChange={items => setValue(current => ({ ...current, coverImageUrl: items[0]?.url || "" }))} onUploadingChange={setUploading} disabled={busy} />{field("title", "Title")}{field("startAt", "Start", "datetime-local")}{field("endAt", "End", "datetime-local")}{field("timezone", "Timezone")}{field("venueName", "Venue or online platform")}{field("address", "Address")}{field("city", "City")}{field("country", "Country")}{field("ticketUrl", "Ticket URL", "url")}{field("capacity", "Capacity", "number")}<label className="block"><span className="mb-1 block text-sm">Description</span><textarea disabled={busy || uploading} value={value.description} onChange={event => setValue({ ...value, description: event.target.value })} rows={6} className="control w-full" /></label><label className="flex gap-2"><input disabled={busy || uploading} type="checkbox" checked={value.isOnline} onChange={event => setValue({ ...value, isOnline: event.target.checked })} />Online event</label><label className="flex gap-2"><input disabled={busy || uploading} type="checkbox" checked={value.rsvpEnabled} onChange={event => setValue({ ...value, rsvpEnabled: event.target.checked })} />Enable RSVP</label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex gap-3"><button type="button" disabled={busy || uploading} onClick={event => void submit(event as any, "draft")} className="secondary-action disabled:opacity-40">Save draft</button><button type="submit" disabled={busy || uploading} onClick={event => void submit(event, "published")} className="primary-action disabled:opacity-40">{uploading ? "Uploading…" : busy ? "Saving…" : "Publish"}</button></div></form>;
}
