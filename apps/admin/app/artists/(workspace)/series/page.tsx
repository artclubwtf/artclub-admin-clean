"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import EmptyState from "@/app/artists/_components/EmptyState";
import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type SeriesItem = {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string;
  createdAt?: string;
  updatedAt?: string;
};

function fmtDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export default function ArtistsSeriesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [items, setItems] = useState<SeriesItem[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/artists/v3/series", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { series?: SeriesItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load series");
      setItems(Array.isArray(payload?.series) ? payload!.series : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load series");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Series name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/artists/v3/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), coverImageUrl: coverImageUrl.trim() || undefined }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to create series");

      setName("");
      setDescription("");
      setCoverImageUrl("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to create series");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Series" subtitle="Create and manage artwork collections">
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <SectionCard title="New series" subtitle="Group related artworks together">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Cover image URL (optional)
            <input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} />
          </label>
          <label className="field md:col-span-2">
            Description
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button className="btnPrimary" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create series"}
            </button>
          </div>
        </form>
      </SectionCard>

      {loading ? <div className="text-sm text-slate-600">Loading series…</div> : null}

      {!loading && items.length === 0 ? (
        <EmptyState title="No series yet" description="Create your first series to organize artworks." />
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} href={`/artists/series/${encodeURIComponent(item.id)}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
              {item.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.coverImageUrl} alt={item.name} className="h-32 w-full rounded object-cover" />
              ) : (
                <div className="flex h-32 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">No cover image</div>
              )}
              <div className="mt-2 text-sm font-semibold text-slate-900">{item.name}</div>
              <div className="text-xs text-slate-500">Updated {fmtDate(item.updatedAt)}</div>
            </Link>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
