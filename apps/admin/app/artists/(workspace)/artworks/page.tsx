"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/app/artists/_components/EmptyState";
import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type Artwork = {
  id: string;
  productKey: string;
  title: string;
  status: string;
  offerings: string;
  forSale?: boolean;
  allowPrints?: boolean;
  seriesId?: string;
  seriesName?: string;
  updatedAt?: string;
  images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
};

type Series = { id: string; name: string };

export default function ArtistsArtworksPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Artwork[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("all");
  const [saleFilter, setSaleFilter] = useState("all");
  const [mode, setMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [artworksRes, seriesRes] = await Promise.all([
          fetch("/api/artists/v2/artworks", { cache: "no-store" }),
          fetch("/api/artists/v3/series", { cache: "no-store" }),
        ]);
        const artworksPayload = (await artworksRes.json().catch(() => null)) as { artworks?: Artwork[]; error?: string } | null;
        if (!artworksRes.ok) throw new Error(artworksPayload?.error || "Failed to load artworks");
        const seriesPayload = (await seriesRes.json().catch(() => null)) as { series?: Series[] } | null;

        if (active) {
          setItems(Array.isArray(artworksPayload?.artworks) ? artworksPayload!.artworks : []);
          setSeries(Array.isArray(seriesPayload?.series) ? seriesPayload!.series : []);
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load artworks");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (seriesFilter !== "all" && (item.seriesId || "") !== seriesFilter) return false;
      if (saleFilter === "for_sale" && item.forSale === false) return false;
      if (saleFilter === "not_for_sale" && item.forSale !== false) return false;
      return true;
    });
  }, [items, saleFilter, seriesFilter, statusFilter]);

  return (
    <PageShell
      title="Artworks"
      subtitle="Manage your artwork catalog, selling options and print readiness"
      actions={
        <Link href="/artists/artworks/new" className="btnPrimary">
          New artwork
        </Link>
      }
    >
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <SectionCard title="Filters" subtitle="Status, series and sale state">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="field">
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="db_only">db_only</option>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="field">
            Series
            <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}>
              <option value="all">All</option>
              {series.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Sale
            <select value={saleFilter} onChange={(e) => setSaleFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="for_sale">For sale</option>
              <option value="not_for_sale">Not for sale</option>
            </select>
          </label>
          <label className="field">
            View
            <select value={mode} onChange={(e) => setMode(e.target.value as "grid" | "list")}>
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </label>
        </div>
      </SectionCard>

      {loading ? <div className="text-sm text-slate-600">Loading artworks…</div> : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No artworks found"
          description="Create your first artwork draft or broaden filters."
          action={
            <Link href="/artists/artworks/new" className="btnPrimary">
              Create artwork
            </Link>
          }
        />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className={mode === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {filtered.map((item) => {
            const preview = item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl || "";
            return (
              <Link
                key={item.productKey}
                href={`/artists/artworks/${encodeURIComponent(item.productKey)}`}
                className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={item.title} className="h-40 w-full rounded object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">No preview image</div>
                )}
                <div className="mt-2 text-sm font-semibold text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-500">
                  {item.status} · {item.seriesName || "No series"}
                </div>
                <div className="text-xs text-slate-500">forSale: {item.forSale === false ? "no" : "yes"}</div>
                <div className="text-xs text-slate-500">prints: {item.allowPrints ? "enabled" : "disabled"}</div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </PageShell>
  );
}
