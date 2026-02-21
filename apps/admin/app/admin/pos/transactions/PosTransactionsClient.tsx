"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PosTransactionRow = {
  id: string;
  status: string;
  createdAt: string;
  buyer: { name: string | null } | null;
  terminalId: string | null;
  payment: { providerTxId: string | null; approvedAt: string | null } | null;
  totals: { grossCents: number; vatCents: number; netCents: number };
};

type PosTransactionDetail = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  buyer: {
    type: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    billingAddress: string | null;
    shippingAddress: string | null;
  } | null;
  items: Array<{
    lineNo: number;
    titleSnapshot: string;
    qty: number;
    unitGrossCents: number;
    vatRate: number;
    lineGrossCents: number;
  }>;
  payment: {
    provider: string;
    providerTxId: string | null;
    method: string;
    tipCents: number | null;
    approvedAt: string | null;
  } | null;
  totals: { grossCents: number; vatCents: number; netCents: number };
  receipt: { receiptNo: string | null; pdfUrl: string | null } | null;
  invoice: { invoiceNo: string | null; pdfUrl: string | null } | null;
  contract: { contractId: string | null; pdfUrl: string | null } | null;
};

type PosAuditEntry = {
  id: string;
  createdAt: string;
  actorAdminId: string | null;
  action: string;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
};

type Filters = {
  from: string;
  to: string;
  status: string;
  minAmount: string;
  maxAmount: string;
};

const initialFilters: Filters = {
  from: "",
  to: "",
  status: "all",
  minAmount: "",
  maxAmount: "",
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

function toQuery(filters: Filters) {
  const params = new URLSearchParams();
  params.set("limit", "200");
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.minAmount) params.set("minAmount", filters.minAmount);
  if (filters.maxAmount) params.set("maxAmount", filters.maxAmount);
  return params.toString();
}

function isReversibleStatus(status: string) {
  return !["refunded", "storno"].includes(status);
}

export default function PosTransactionsClient() {
  const [rows, setRows] = useState<PosTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [activeFilters, setActiveFilters] = useState<Filters>(initialFilters);

  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PosTransactionDetail | null>(null);
  const [audit, setAudit] = useState<PosAuditEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [actionReason, setActionReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const listQuery = useMemo(() => toQuery(activeFilters), [activeFilters]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pos/transactions?${listQuery}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; transactions?: PosTransactionRow[]; error?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to load transactions");
      }
      setRows(Array.isArray(payload.transactions) ? payload.transactions : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load transactions";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [listQuery]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/admin/pos/transactions/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            transaction?: PosTransactionDetail;
            audit?: PosAuditEntry[];
            error?: string;
          }
        | null;
      if (!res.ok || !payload?.ok || !payload.transaction) {
        throw new Error(payload?.error || "Failed to load transaction detail");
      }
      setDetail(payload.transaction);
      setAudit(Array.isArray(payload.audit) ? payload.audit : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load transaction detail";
      setDetailError(message);
      setDetail(null);
      setAudit([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!selectedTxId) return;
    void loadDetail(selectedTxId);
  }, [selectedTxId, loadDetail]);

  const runAction = async (kind: "refund" | "storno") => {
    if (!selectedTxId || !detail) return;
    const reason = actionReason.trim();
    if (!reason) {
      setActionMessage("Reason is required.");
      return;
    }

    let amountCents: number | undefined;
    if (kind === "refund" && refundAmount.trim()) {
      const amountValue = Number(refundAmount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setActionMessage("Refund amount must be a positive number.");
        return;
      }
      amountCents = Math.round(amountValue * 100);
    }

    const confirmed = window.confirm(
      kind === "refund" ? "Confirm refund for this transaction?" : "Confirm storno for this transaction?",
    );
    if (!confirmed) return;

    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/pos/transactions/${encodeURIComponent(selectedTxId)}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          ...(kind === "refund" && amountCents ? { amountCents } : {}),
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; status?: string } | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `${kind} failed`);
      }
      setActionMessage(`${kind === "refund" ? "Refund" : "Storno"} completed.`);
      setActionReason("");
      if (kind === "refund") setRefundAmount("");
      await Promise.all([loadRows(), loadDetail(selectedTxId)]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `${kind} failed`;
      setActionMessage(message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <main className="admin-dashboard">
      <header className="space-y-1">
        <p className="text-sm text-slate-500">POS</p>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-sm text-slate-600">Filter, review, refund and storno POS transactions.</p>
      </header>

      <section className="card space-y-3">
        <div className="cardHeader">
          <strong>Filters</strong>
          <div className="flex gap-2">
            <button
              type="button"
              className="btnGhost"
              onClick={() => {
                setFilters(initialFilters);
                setActiveFilters(initialFilters);
              }}
            >
              Reset
            </button>
            <button type="button" className="btnPrimary" onClick={() => setActiveFilters(filters)}>
              Apply
            </button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs text-slate-600">From</span>
            <input
              type="date"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">To</span>
            <input
              type="date"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Status</span>
            <select
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="created">created</option>
              <option value="payment_pending">payment_pending</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
              <option value="refunded">refunded</option>
              <option value="storno">storno</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Min amount (EUR)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={filters.minAmount}
              onChange={(event) => setFilters((prev) => ({ ...prev, minAmount: event.target.value }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Max amount (EUR)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={filters.maxAmount}
              onChange={(event) => setFilters((prev) => ({ ...prev, maxAmount: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="cardHeader">
          <strong>History</strong>
          <span className="text-xs text-slate-500">{rows.length} total</span>
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        {loading ? (
          <p className="text-sm text-slate-600">Loading transactions...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600">No POS transactions for current filter.</p>
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
                  <th>Action</th>
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
                    <td>
                      <button
                        type="button"
                        className="btnGhost"
                        onClick={() => {
                          setSelectedTxId(row.id);
                          setActionReason("");
                          setRefundAmount("");
                          setActionMessage(null);
                        }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedTxId && (
        <div className="fixed inset-0 z-50 flex bg-black/40" onClick={() => setSelectedTxId(null)}>
          <aside
            className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cardHeader">
              <strong>Transaction detail</strong>
              <button type="button" className="btnGhost" onClick={() => setSelectedTxId(null)}>
                Close
              </button>
            </div>

            {detailLoading ? <p className="text-sm text-slate-600">Loading detail...</p> : null}
            {detailError ? <p className="text-sm text-rose-700">{detailError}</p> : null}

            {detail && (
              <div className="space-y-4">
                <section className="rounded border border-slate-200 p-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p>
                      <strong>ID:</strong> {detail.id}
                    </p>
                    <p>
                      <strong>Status:</strong> {detail.status}
                    </p>
                    <p>
                      <strong>Created:</strong> {formatDate(detail.createdAt)}
                    </p>
                    <p>
                      <strong>Updated:</strong> {formatDate(detail.updatedAt)}
                    </p>
                    <p>
                      <strong>Buyer:</strong> {detail.buyer?.name || "n/a"}
                    </p>
                    <p>
                      <strong>Gross:</strong> {formatEuroFromCents(detail.totals?.grossCents || 0)}
                    </p>
                  </div>
                </section>

                <section className="rounded border border-slate-200 p-3 text-sm">
                  <p className="mb-2 font-semibold">Documents</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {detail.receipt?.pdfUrl ? (
                      <a className="btnGhost justify-center" href={detail.receipt.pdfUrl} target="_blank" rel="noreferrer">
                        Receipt
                      </a>
                    ) : (
                      <span className="btnGhost justify-center opacity-60">Receipt n/a</span>
                    )}
                    {detail.invoice?.pdfUrl ? (
                      <a className="btnGhost justify-center" href={detail.invoice.pdfUrl} target="_blank" rel="noreferrer">
                        Invoice
                      </a>
                    ) : (
                      <span className="btnGhost justify-center opacity-60">Invoice n/a</span>
                    )}
                    {detail.contract?.pdfUrl ? (
                      <a className="btnGhost justify-center" href={detail.contract.pdfUrl} target="_blank" rel="noreferrer">
                        Contract
                      </a>
                    ) : (
                      <span className="btnGhost justify-center opacity-60">Contract n/a</span>
                    )}
                  </div>
                </section>

                <section className="rounded border border-slate-200 p-3 text-sm">
                  <p className="mb-2 font-semibold">Reversal actions</p>
                  <div className="space-y-2">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Reason *</span>
                      <textarea
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        rows={2}
                        value={actionReason}
                        onChange={(event) => setActionReason(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Refund amount (EUR, optional)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={refundAmount}
                        onChange={(event) => setRefundAmount(event.target.value)}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="btnGhost"
                        disabled={actionLoading || detail.status !== "paid"}
                        onClick={() => {
                          void runAction("refund");
                        }}
                      >
                        {actionLoading ? "Working..." : "Refund"}
                      </button>
                      <button
                        type="button"
                        className="btnPrimary"
                        disabled={actionLoading || !isReversibleStatus(detail.status)}
                        onClick={() => {
                          void runAction("storno");
                        }}
                      >
                        {actionLoading ? "Working..." : "Storno"}
                      </button>
                    </div>
                    {actionMessage && <p className="text-xs text-slate-600">{actionMessage}</p>}
                  </div>
                </section>

                <section className="rounded border border-slate-200 p-3 text-sm">
                  <p className="mb-2 font-semibold">Line items</p>
                  <div className="overflow-x-auto">
                    <table className="ac-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Title</th>
                          <th>Qty</th>
                          <th>Unit</th>
                          <th>VAT</th>
                          <th>Line gross</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((line) => (
                          <tr key={`${line.lineNo}-${line.titleSnapshot}`}>
                            <td>{line.lineNo}</td>
                            <td>{line.titleSnapshot}</td>
                            <td>{line.qty}</td>
                            <td>{formatEuroFromCents(line.unitGrossCents)}</td>
                            <td>{line.vatRate}%</td>
                            <td>{formatEuroFromCents(line.lineGrossCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded border border-slate-200 p-3 text-sm">
                  <p className="mb-2 font-semibold">Audit timeline</p>
                  {audit.length === 0 ? (
                    <p className="text-slate-500">No audit entries found.</p>
                  ) : (
                    <div className="space-y-2">
                      {audit.map((entry) => (
                        <div key={entry.id} className="rounded border border-slate-200 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>{entry.action}</strong>
                            <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                          </div>
                          <p className="text-xs text-slate-500">actor: {entry.actorAdminId || "n/a"}</p>
                          {typeof entry.payload?.reason === "string" && (
                            <p className="text-xs text-slate-600">reason: {entry.payload.reason}</p>
                          )}
                          <details>
                            <summary className="cursor-pointer text-xs text-slate-600">Payload</summary>
                            <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-[11px]">
                              {JSON.stringify(entry.payload, null, 2)}
                            </pre>
                          </details>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
