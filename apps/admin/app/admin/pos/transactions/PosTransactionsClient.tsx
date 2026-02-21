"use client";

import { useEffect, useState } from "react";

type PosTransactionRow = {
  id: string;
  status: string;
  createdAt: string;
  buyer: { name: string | null } | null;
  terminalId: string | null;
  payment: { providerTxId: string | null; approvedAt: string | null } | null;
  totals: { grossCents: number; vatCents: number; netCents: number };
};

function formatEuroFromCents(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString();
}

export default function PosTransactionsClient() {
  const [rows, setRows] = useState<PosTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/pos/transactions?limit=100", { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; transactions?: PosTransactionRow[]; error?: string }
          | null;
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load transactions");
        }
        setRows(Array.isArray(payload.transactions) ? payload.transactions : []);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load transactions";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="admin-dashboard">
      <header className="space-y-1">
        <p className="text-sm text-slate-500">POS</p>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-slate-600">Live history of POS checkouts and payment state transitions.</p>
      </header>

      <section className="card">
        <div className="cardHeader">
          <strong>History</strong>
          <span className="text-xs text-slate-500">{rows.length} total</span>
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        {loading ? (
          <p className="text-sm text-slate-600">Loading transactions...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600">No POS transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Buyer</th>
                  <th>Gross</th>
                  <th>Terminal</th>
                  <th>Provider Tx</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.status}</td>
                    <td>{row.buyer?.name || "n/a"}</td>
                    <td>{formatEuroFromCents(row.totals?.grossCents || 0)}</td>
                    <td>{row.terminalId || "n/a"}</td>
                    <td>{row.payment?.providerTxId || "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
