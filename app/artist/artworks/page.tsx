"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Request = {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
  payload?: {
    title?: string;
    offering?: "print_only" | "original_plus_prints";
    mediaIds?: string[];
  };
};

const statusStyles: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  in_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-rose-100 text-rose-800",
  applied: "bg-emerald-100 text-emerald-800",
};

export default function ArtistArtworksPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/requests", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { requests?: Request[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load requests");
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const artworkRequests = useMemo(
    () => requests.filter((r) => r.type === "artwork_create"),
    [requests],
  );

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleString() : "");

  return (
    <div className="space-y-4">
      <div className="artist-card space-y-2">
        <div className="artist-section-title">Artworks</div>
        <div className="artist-section-sub">
          Submit new artworks for review. The team will process your submission and publish to Shopify.
        </div>
        <Link href="/artist/artworks/new" className="artist-btn inline-flex w-auto">
          Submit new artwork
        </Link>
      </div>

      <div className="artist-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">Your submissions</div>
            <div className="text-sm text-slate-600">Track artwork requests you have sent.</div>
          </div>
          <button type="button" className="artist-btn-ghost" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        {error && <div className="artist-placeholder">Error: {error}</div>}
        {loading && <div className="artist-placeholder">Loading...</div>}

        {artworkRequests.length === 0 && !loading ? (
          <div className="artist-placeholder">No submissions yet. Tap “Submit new artwork”.</div>
        ) : (
          <div className="space-y-2">
            {artworkRequests.map((req) => {
              const statusClass = statusStyles[req.status] || "bg-slate-100 text-slate-700";
              const title = req.payload?.title || "Untitled artwork";
              const offering = req.payload?.offering === "original_plus_prints" ? "Original + prints" : "Print only";
              const images = req.payload?.mediaIds?.length ?? 0;

              return (
                <div key={req.id} className="artist-subtle-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{title}</div>
                      <div className="text-sm text-slate-600">{offering}</div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{req.status}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>{images} image(s)</span>
                    <span>•</span>
                    <span>{formatDate(req.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
