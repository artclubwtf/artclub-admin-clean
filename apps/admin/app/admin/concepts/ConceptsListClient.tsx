"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Concept = {
  _id: string;
  title: string;
  brandKey: "artclub" | "alea";
  type: "sponsoring" | "leasing" | "event";
  status: "draft" | "internal_review" | "ready_to_send" | "sent" | "won" | "lost";
  granularity: "short" | "standard" | "detailed";
  updatedAt?: string;
  createdAt?: string;
};

const brandOptions: Concept["brandKey"][] = ["artclub", "alea"];
const typeOptions: Concept["type"][] = ["sponsoring", "leasing", "event"];
const statusOptions: Concept["status"][] = ["draft", "internal_review", "ready_to_send", "sent", "won", "lost"];

export default function ConceptsListClient() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        if (brandFilter) params.set("brandKey", brandFilter);
        if (typeFilter) params.set("type", typeFilter);
        if (statusFilter) params.set("status", statusFilter);

        const res = await fetch(`/api/concepts?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { concepts?: Concept[]; error?: string } | null;
        if (!res.ok) {
          throw new Error(json?.error || "Failed to load concepts");
        }
        if (!active) return;
        setConcepts(Array.isArray(json?.concepts) ? json.concepts : []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load concepts";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [search, brandFilter, typeFilter, statusFilter, refreshToken]);

  const filteredConcepts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return concepts.filter((c) => {
      if (brandFilter && c.brandKey !== brandFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return c.title.toLowerCase().includes(normalizedSearch);
    });
  }, [concepts, search, brandFilter, typeFilter, statusFilter]);

  return (
    <section className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="concept-search">
              Search
            </label>
            <input
              id="concept-search"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="concept-brand">
                Brand
              </label>
              <select
                id="concept-brand"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
              >
                <option value="">All</option>
                {brandOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="concept-type">
                Type
              </label>
              <select
                id="concept-type"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="concept-status">
                Status
              </label>
              <select
                id="concept-status"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline"
            onClick={() => {
              setSearch("");
              setBrandFilter("");
              setTypeFilter("");
              setStatusFilter("");
              setRefreshToken((n) => n + 1);
            }}
          >
            Reset
          </button>
          {loading && <span>Loading…</span>}
          {error && <span className="text-red-600">Error: {error}</span>}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Concepts</h2>
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline"
            onClick={() => setRefreshToken((n) => n + 1)}
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 divide-y divide-slate-200">
          {filteredConcepts.length === 0 && !loading ? (
            <p className="py-6 text-sm text-slate-600">No concepts found.</p>
          ) : (
            filteredConcepts.map((concept) => (
              <Link
                key={concept._id}
                href={`/admin/concepts/${concept._id}`}
                className="flex flex-col gap-2 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{concept.title || "Untitled"}</span>
                    <span className="text-xs text-slate-600">
                      {concept.brandKey} • {concept.type} • {concept.granularity}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700">
                    {concept.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  Updated {concept.updatedAt ? new Date(concept.updatedAt).toLocaleString() : "—"}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
