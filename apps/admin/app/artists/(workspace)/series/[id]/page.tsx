"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type SeriesPayload = {
  ok: boolean;
  series: {
    id: string;
    name: string;
    description: string;
    coverImageUrl: string;
  };
};

export default function SeriesDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const seriesId = decodeURIComponent(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesPayload["series"] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/artists/v3/series/${encodeURIComponent(seriesId)}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as SeriesPayload | { error?: string } | null;
        if (!res.ok) throw new Error((payload as { error?: string } | null)?.error || "Failed to load series");
        if (active) setSeries((payload as SeriesPayload).series);
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load series");
      } finally {
        if (active) setLoading(false);
      }
    };

    if (seriesId) void load();
    return () => {
      active = false;
    };
  }, [seriesId]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!series) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/artists/v3/series/${encodeURIComponent(seriesId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: series.name,
          description: series.description,
          coverImageUrl: series.coverImageUrl,
        }),
      });
      const payload = (await res.json().catch(() => null)) as SeriesPayload | { error?: string } | null;
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error || "Failed to save series");
      setSeries((payload as SeriesPayload).series);
      setMessage("Series updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to save series");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this series?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/artists/v3/series/${encodeURIComponent(seriesId)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to delete series");
      router.replace("/artists/series");
    } catch (err: any) {
      setError(err?.message || "Failed to delete series");
      setDeleting(false);
    }
  };

  return (
    <PageShell
      title="Series"
      subtitle={seriesId}
      actions={
        <>
          <Link href="/artists/series" className="btnGhost">
            Back
          </Link>
          <button className="btnGhost" type="button" onClick={onDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </>
      }
    >
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading series…</div> : null}

      {!loading && series ? (
        <form className="grid gap-4" onSubmit={onSave}>
          <SectionCard title="Series details" subtitle="Update metadata and cover image">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Name
                <input value={series.name} onChange={(e) => setSeries((prev) => ({ ...prev!, name: e.target.value }))} />
              </label>
              <label className="field">
                Cover image URL
                <input
                  value={series.coverImageUrl}
                  onChange={(e) => setSeries((prev) => ({ ...prev!, coverImageUrl: e.target.value }))}
                />
              </label>
              <label className="field md:col-span-2">
                Description
                <textarea
                  rows={5}
                  value={series.description}
                  onChange={(e) => setSeries((prev) => ({ ...prev!, description: e.target.value }))}
                />
              </label>
            </div>
          </SectionCard>

          {series.coverImageUrl ? (
            <SectionCard title="Cover preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={series.coverImageUrl} alt={series.name} className="h-56 w-full rounded object-cover" />
            </SectionCard>
          ) : null}

          <div className="flex justify-end">
            <button className="btnPrimary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save series"}
            </button>
          </div>
        </form>
      ) : null}
    </PageShell>
  );
}
