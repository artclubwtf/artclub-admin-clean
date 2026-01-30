"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ApplicationListItem = {
  id: string;
  status: string;
  personal?: {
    fullName?: string | null;
    email?: string | null;
  };
  submittedAt?: string | null;
  reviewedAt?: string | null;
  acceptedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const statusOptions = ["", "draft", "submitted", "accepted", "rejected"] as const;

type StatusFilter = (typeof statusOptions)[number];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("submitted");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/admin/applications${qs}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { applications?: ApplicationListItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load registrations");
      setApplications(Array.isArray(payload?.applications) ? payload.applications : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load registrations");
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
    if (!term) return applications;
    return applications.filter((app) => {
      const name = app.personal?.fullName?.toLowerCase() || "";
      const email = app.personal?.email?.toLowerCase() || "";
      return (
        name.includes(term) ||
        email.includes(term) ||
        app.status.toLowerCase().includes(term) ||
        app.id.toLowerCase().includes(term)
      );
    });
  }, [applications, search]);

  return (
    <main className="p-6 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Registrations</h1>
          <p className="text-sm text-slate-600">Review incoming artist registrations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {statusOptions
              .filter((s) => s)
              .map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </header>

      {error && <div className="card text-red-600">Error: {error}</div>}

      <div className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Registrations</h2>
          {loading ? (
            <span className="text-xs text-slate-500">Loading...</span>
          ) : (
            <span className="text-xs text-slate-500">{filtered.length} total</span>
          )}
        </div>

        {filtered.length === 0 && !loading && <p className="text-sm text-slate-600">No registrations found.</p>}

        <ul className="grid gap-3">
          {filtered.map((app) => (
            <li key={app.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {app.personal?.fullName || app.personal?.email || "Unnamed registrant"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {app.personal?.email || "No email"} ·{" "}
                    {(app.status === "in_review" ? "submitted" : app.status).replace(/_/g, " ")}
                  </div>
                </div>
                <Link href={`/admin/applications/${app.id}`} className="btnGhost">
                  View
                </Link>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Submitted {formatDate(app.submittedAt)} · Created {formatDate(app.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
