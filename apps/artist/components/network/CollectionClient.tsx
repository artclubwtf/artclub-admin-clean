"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import { FormEvent, useEffect, useState } from "react";

import { ImageUpload, type ImageUploadItem } from "@/components/forms/ImageUpload";

const api = createNetworkApiClient();

export function CollectionClient() {
  const [items, setItems] = useState<any[]>([]);
  const [value, setValue] = useState({ customArtistName: "", customArtworkTitle: "", customImageUrl: "", note: "", visibility: "private", purchasePriceVisibility: "private" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const imageItems: ImageUploadItem[] = value.customImageUrl ? [{ url: value.customImageUrl }] : [];

  async function load() {
    try { const data = await api.request<any>("/collection"); setItems(data.items); }
    catch (reason: any) { setError(reason.message); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.request("/collection", { method: "POST", body: JSON.stringify(value) });
      setValue(current => ({ ...current, customArtistName: "", customArtworkTitle: "", customImageUrl: "", note: "" }));
      await load();
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-3xl py-7"><h1 className="page-heading">My collection</h1><form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl bg-[var(--surface-soft)] p-5 sm:grid-cols-2"><input required disabled={busy} value={value.customArtistName} onChange={event => setValue({ ...value, customArtistName: event.target.value })} placeholder="Artist" className="control" /><input required disabled={busy} value={value.customArtworkTitle} onChange={event => setValue({ ...value, customArtworkTitle: event.target.value })} placeholder="Artwork title" className="control" /><div className="sm:col-span-2"><ImageUpload label="Artwork image" hint="Upload a photo of the work; no technical link is needed." variant="collection" items={imageItems} onChange={images => setValue(current => ({ ...current, customImageUrl: images[0]?.url || "" }))} onUploadingChange={setBusy} /></div><textarea disabled={busy} value={value.note} onChange={event => setValue({ ...value, note: event.target.value })} placeholder="Private note" className="control sm:col-span-2" /><label className="text-sm"><span className="mr-2">Visibility</span><select disabled={busy} value={value.visibility} onChange={event => setValue({ ...value, visibility: event.target.value })} className="control"><option value="private">Private</option><option value="connections">Connections</option><option value="public">Public</option></select></label><button disabled={busy} className="primary-action disabled:opacity-40">{busy ? "Working…" : "Add artwork"}</button></form>{error && <p className="mt-4 text-[var(--danger)]">{error}</p>}<div className="mt-8 grid gap-6 sm:grid-cols-2">{items.map(item => <article key={item.id}>{item.customImageUrl ? <img src={item.customImageUrl} alt={item.customArtworkTitle} className="aspect-square w-full rounded-2xl object-cover" /> : <div className="aspect-square rounded-2xl bg-[var(--surface-soft)]" />}<h2 className="mt-3 font-medium">{item.customArtworkTitle}</h2><p className="meta-text">{item.customArtistName} · {item.visibility}</p></article>)}</div></div>;
}
