"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Artist = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  stage?: string;
};

const stages = ["Idea", "In Review", "Offer", "Under Contract"] as const;

export default function ArtistsPageClient() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (stageFilter) params.set("stage", stageFilter);
        const res = await fetch(`/api/artists?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load artists");
        }
        const json = await res.json();
        if (!active) return;
        setArtists(Array.isArray(json.artists) ? json.artists : []);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load artists");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [query, stageFilter]);

  const filteredCount = useMemo(() => artists.length, [artists]);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Stage
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">All</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Artists</h2>
          {loading ? (
            <span className="text-xs text-slate-500">Loading...</span>
          ) : (
            <span className="text-xs text-slate-500">{filteredCount} total</span>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}
        {!loading && !error && artists.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">No artists found.</p>
        )}

        <ul className="mt-4 grid gap-3">
          {artists.map((artist) => (
            <li
              key={artist._id}
              className="rounded border border-slate-200 px-4 py-3 hover:border-slate-300"
            >
              <Link href={`/admin/artists/${artist._id}`} className="block space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{artist.name || "Unbenannt"}</div>
                  {artist.stage && <span className="text-xs text-slate-500">{artist.stage}</span>}
                </div>
                {(artist.email || artist.phone) && (
                  <div className="text-xs text-slate-500">
                    {[artist.email, artist.phone].filter(Boolean).join(" • ")}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
