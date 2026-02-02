"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TermsDocumentItem = {
  id: string;
  key: string;
  title: string;
  updatedAt?: string | null;
  activeVersion?: {
    id: string;
    version: number;
    status: string;
    effectiveAt?: string | null;
    createdAt?: string | null;
  } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminTermsPage() {
  const [documents, setDocuments] = useState<TermsDocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/terms", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { documents?: TermsDocumentItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load terms documents");
      setDocuments(Array.isArray(payload?.documents) ? payload.documents : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load terms documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="admin-dashboard">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Terms</h1>
          <p className="text-sm text-slate-600">Manage versioned terms and publishing history.</p>
        </div>
      </header>

      {error && <div className="card text-red-600">Error: {error}</div>}

      <div className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Documents</h2>
          {loading ? <span className="text-xs text-slate-500">Loading...</span> : null}
        </div>

        {!loading && documents.length === 0 ? <p className="text-sm text-slate-600">No terms documents found.</p> : null}

        <ul className="grid gap-3">
          {documents.map((doc) => (
            <li key={doc.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{doc.title}</div>
                  <div className="text-xs text-slate-500">{doc.key}</div>
                </div>
                <Link href={`/admin/terms/${doc.key}`} className="btnGhost">
                  Edit
                </Link>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Active:{" "}
                {doc.activeVersion
                  ? `v${doc.activeVersion.version} (${doc.activeVersion.status}) · Effective ${formatDate(
                      doc.activeVersion.effectiveAt || doc.activeVersion.createdAt,
                    )}`
                  : "—"}
                {" · "}Updated {formatDate(doc.updatedAt)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
