"use client";

import { useEffect, useMemo, useState } from "react";

type KeyListItem = {
  id: string;
  code: string;
  expiresAt?: string | null;
  usedAt?: string | null;
  createdAt?: string | null;
  usedBy?: {
    id: string;
    email: string;
    artistKey?: string | null;
  } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminArtistKeysPage() {
  const [count, setCount] = useState("10");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keys, setKeys] = useState<KeyListItem[]>([]);

  const publicBaseUrl = useMemo(() => {
    const fromEnv = (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
    return "";
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/artists/keys?limit=50", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { keys?: KeyListItem[]; error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load keys");
      }
      setKeys(Array.isArray(payload?.keys) ? payload.keys : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const parsedCount = Number(count);
      const parsedDays = Number(expiresInDays);
      const res = await fetch("/api/admin/artists/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: Number.isFinite(parsedCount) ? parsedCount : 10,
          expiresInDays: Number.isFinite(parsedDays) ? parsedDays : 14,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; count?: number; codes?: string[]; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to generate keys");
      }

      setNotice(`Generated ${payload?.count || 0} keys.`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to generate keys");
    } finally {
      setGenerating(false);
    }
  };

  const copyText = async (text: string, successLabel: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(successLabel);
      setError(null);
    } catch {
      setError("Clipboard copy failed");
    }
  };

  return (
    <main className="admin-dashboard">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Artist Keys</h1>
          <p className="text-sm text-slate-600">Generate registration keys and share invite links quickly.</p>
        </div>
      </header>

      {error ? <div className="card text-red-600">Error: {error}</div> : null}
      {notice ? <div className="card text-emerald-700">{notice}</div> : null}

      <section className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Generate keys</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">
            Count
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              disabled={generating}
            />
          </label>
          <label className="field">
            Expires in days
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              disabled={generating}
            />
          </label>
        </div>
        <button type="button" className="btnPrimary w-fit" onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating..." : "Generate keys"}
        </button>
      </section>

      <section className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Recent keys</h2>
          {loading ? <span className="text-xs text-slate-500">Loading...</span> : null}
        </div>

        {!loading && keys.length === 0 ? <p className="text-sm text-slate-600">No keys found.</p> : null}

        {keys.length > 0 ? (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Expires</th>
                  <th className="px-2 py-2">Used</th>
                  <th className="px-2 py-2">Used by</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((item) => {
                  const inviteLink = `${publicBaseUrl}/artists/register?key=${encodeURIComponent(item.code)}`;
                  return (
                    <tr key={item.id} className="border-t border-slate-200 align-top">
                      <td className="px-2 py-2 font-mono text-xs text-slate-800">{item.code}</td>
                      <td className="px-2 py-2 text-xs text-slate-700">{formatDate(item.expiresAt)}</td>
                      <td className="px-2 py-2 text-xs text-slate-700">{formatDate(item.usedAt)}</td>
                      <td className="px-2 py-2 text-xs text-slate-700">
                        {item.usedBy ? item.usedBy.email : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btnGhost"
                            onClick={() => void copyText(item.code, `Copied code ${item.code}`)}
                          >
                            Copy code
                          </button>
                          <button
                            type="button"
                            className="btnGhost"
                            onClick={() => void copyText(inviteLink, `Copied invite link for ${item.code}`)}
                          >
                            Copy invite link
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
