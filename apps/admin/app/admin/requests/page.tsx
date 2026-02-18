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
  payload?: any;
};

const statusOptions = ["", "submitted", "in_review", "approved", "rejected", "applied"] as const;
const statusStyles: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  in_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-rose-100 text-rose-800",
  applied: "bg-emerald-100 text-emerald-800",
};

const typeLabels: Record<string, string> = {
  artwork_create: "Artwork submission",
  payout_update: "Payout change",
  profile_update: "Profile change",
};

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

  const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "—");

  const renderPayload = (request: RequestItem) => {
    if (request.type === "profile_update") {
      const profile = request.payload?.publicProfile || {};
      const entries = Object.entries(profile).filter(([, value]) => value !== undefined);
      if (!entries.length) return <div className="text-xs text-slate-500">No profile fields submitted.</div>;
      return (
        <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded bg-slate-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{key}</div>
              <div className="font-medium text-slate-900">{value ?? "—"}</div>
            </div>
          ))}
        </div>
      );
    }

    if (request.type === "payout_update") {
      const payout = request.payload?.payout || {};
      const entries = Object.entries(payout).filter(([, value]) => value !== undefined);
      if (!entries.length) return <div className="text-xs text-slate-500">No payout fields submitted.</div>;
      return (
        <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded bg-slate-50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{key}</div>
              <div className="font-medium text-slate-900">{value ?? "—"}</div>
            </div>
          ))}
        </div>
      );
    }

    if (request.type === "artwork_create") {
      const payload = request.payload || {};
      return (
        <div className="grid gap-2 sm:grid-cols-3 text-sm text-slate-700">
          <div className="rounded bg-slate-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Title</div>
            <div className="font-medium text-slate-900">{payload.title || "Untitled"}</div>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Offering</div>
            <div className="font-medium text-slate-900">{payload.offering || "—"}</div>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Media</div>
            <div className="font-medium text-slate-900">{Array.isArray(payload.mediaIds) ? payload.mediaIds.length : 0}</div>
          </div>
        </div>
      );
    }

    return (
      <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
        {JSON.stringify(request.payload ?? {}, null, 2)}
      </pre>
    );
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
          {loading ? (
            <span className="text-xs text-slate-500">Loading...</span>
          ) : (
            <span className="text-xs text-slate-500">{filtered.length} total</span>
          )}
        </div>

        {filtered.length === 0 && !loading && <p className="text-sm text-slate-600">No requests found.</p>}

        <ul className="grid gap-4">
          {filtered.map((r) => {
            const statusClass = statusStyles[r.status] || "bg-slate-100 text-slate-700";
            return (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-500">Artist</div>
                    <div className="text-lg font-semibold text-slate-900">{r.artistName || r.artistId || "Unknown artist"}</div>
                    <div className="text-xs text-slate-500">{typeLabels[r.type] || r.type}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{r.status}</span>
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
                </div>

                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                  <div>Created: {formatDate(r.createdAt)}</div>
                  <div>Updated: {formatDate(r.updatedAt)}</div>
                  <div>Applied: {formatDate(r.appliedAt)}</div>
                </div>

                <div className="mt-3">{renderPayload(r)}</div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-500">Raw payload</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                    {JSON.stringify(r.payload ?? {}, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
