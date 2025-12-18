"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ShopifyKuenstler } from "@/lib/shopify";

type Props = {
  artists: ShopifyKuenstler[];
};

export default function ArtistsPageClient({ artists }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((artist) => (artist.name ?? "").toLowerCase().includes(q));
  }, [artists, query]);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Artists</h2>
          <span className="text-xs text-slate-500">{filtered.length} total</span>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No artists match your search.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {filtered.map((artist) => (
            <li
              key={artist.id}
              className="rounded border border-slate-200 px-4 py-3 hover:border-slate-300"
            >
              <Link
                href={`/admin/artists/${encodeURIComponent(artist.id)}`}
                className="block space-y-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{artist.name || "Ohne Name"}</div>
                  {artist.instagram && (
                      <span className="text-xs text-slate-500">
                        {artist.instagram.startsWith("@") ? artist.instagram : `@${artist.instagram}`}
                      </span>
                    )}
                  </div>
                  {artist.quote && <p className="text-sm text-slate-700">“{artist.quote}”</p>}
                  <div className="text-xs text-slate-400">{artist.handle}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
