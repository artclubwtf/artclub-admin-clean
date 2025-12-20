"use client";

import { useEffect, useMemo, useState } from "react";

type RequestItem = {
  id: string;
  artistId?: string;
  artistName?: string;
  type: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  appliedAt?: string;
  payload?: unknown;
};

const statusOptions = ["", "submitted", "in_review", "approved", "rejected", "applied"] as const;

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("submitted");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/admin/requests${qs}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { requests?: RequestItem[]; error?: string } | null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (!term) return true;
      return (
        r.artistName?.toLowerCase().includes(term) ||
        r.artistId?.toLowerCase().includes(term) ||
        r.type.toLowerCase().includes(term) ||
        r.status.toLowerCase().includes(term)
      );
    });
  }, [requests, search]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionError(null);
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Action failed");
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? "Action failed");
    } finally {
      setActingId(null);
    }
  };

  return (
    <main className="p-6 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Requests</h1>
          <p className="text-sm text-slate-600">Review artist requests.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as (typeof statusOptions)[number])}
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {statusOptions
              .filter((s) => s)
              .map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artist or status"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </header>

      {error && <div className="card text-red-600">Error: {error}</div>}
      {actionError && <div className="card text-red-600">Action error: {actionError}</div>}

      <div className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Requests</h2>
          {loading ? <span className="text-xs text-slate-500">Loading...</span> : <span className="text-xs text-slate-500">{filtered.length} total</span>}
        </div>

        {filtered.length === 0 && !loading && <p className="text-sm text-slate-600">No requests found.</p>}

        <ul className="grid gap-3">
          {filtered.map((r) => (
            <li key={r.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{r.artistName || r.artistId || "Unknown artist"}</div>
                  <div className="text-xs text-slate-500">
                    {r.type} · {r.status}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btnGhost"
                    disabled={actingId === r.id}
                    onClick={() => handleAction(r.id, "approve")}
                  >
                    {actingId === r.id ? "Working..." : "Approve"}
                  </button>
                  <button
                    className="btnGhost"
                    disabled={actingId === r.id}
                    onClick={() => handleAction(r.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Created {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                {r.appliedAt ? ` · Applied ${new Date(r.appliedAt).toLocaleString()}` : ""}
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                {JSON.stringify(r.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
