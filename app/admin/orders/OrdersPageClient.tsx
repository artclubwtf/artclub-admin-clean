"use client";

import { useEffect, useMemo, useState } from "react";

type OrderListItem = {
  id: string;
  source: "shopify" | "pos";
  createdAt: string;
  label: string;
  gross: number;
  currency: string;
  artistMetaobjectGids: string[];
  unassignedCount: number;
  lineItemCount: number;
  status?: string | null;
};

type ArtistOption = { id: string; name: string; metaobjectId?: string | null };

type DateRangeKey = "last7" | "last30" | "last90" | "custom";

export default function OrdersPageClient() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState<"all" | "shopify" | "pos">("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("last7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [artistFilter, setArtistFilter] = useState<string>("all");
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);

  const [showPosForm, setShowPosForm] = useState(false);
  const [posDate, setPosDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [posNote, setPosNote] = useState("");
  const [posSaving, setPosSaving] = useState(false);
  const [posMessage, setPosMessage] = useState<string | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderListItem | null>(null);
  const [posLines, setPosLines] = useState<
    { id: string; title: string; quantity: string; unitPrice: string; saleType: "print" | "original" | "unknown"; artist: string }[]
  >([
    {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      title: "",
      quantity: "1",
      unitPrice: "",
      saleType: "unknown",
      artist: "",
    },
  ]);

  const computedDateRange = useMemo(() => {
    if (dateRange === "custom") {
      return {
        start: customStart || null,
        end: customEnd || null,
      };
    }
    const now = new Date();
    const days = dateRange === "last7" ? 7 : dateRange === "last30" ? 30 : 90;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
  }, [dateRange, customStart, customEnd]);

  useEffect(() => {
    let active = true;
    const loadOrders = async () => {
      setLoading(true);
      setError(null);
      setImportMessage(null);
      try {
        const params = new URLSearchParams();
        if (sourceFilter !== "all") params.set("source", sourceFilter);
        if (computedDateRange.start) params.set("start", computedDateRange.start);
        if (computedDateRange.end) params.set("end", computedDateRange.end);
        if (artistFilter !== "all") params.set("artistMetaobjectId", artistFilter);

        const res = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load orders");
        }
        const json = await res.json();
        if (!active) return;
        const list = Array.isArray(json.orders) ? json.orders : [];
        setOrders(list);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load orders");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadOrders();
    return () => {
      active = false;
    };
  }, [sourceFilter, computedDateRange.start, computedDateRange.end, artistFilter]);

  useEffect(() => {
    let active = true;
    const loadArtists = async () => {
      setArtistsLoading(true);
      try {
        const res = await fetch("/api/artists?stage=Under Contract", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!active) return;
        const list: ArtistOption[] = Array.isArray(json.artists)
          ? json.artists.map((a: any) => ({
              id: a._id,
              name: a.name || "Unbenannt",
              metaobjectId: a.shopifySync?.metaobjectId || null,
            }))
          : [];
        setArtists(list);
      } catch {
        /* ignore */
      } finally {
        if (active) setArtistsLoading(false);
      }
    };
    loadArtists();
    return () => {
      active = false;
    };
  }, []);

  const artistOptions = useMemo(() => {
    const filtered = artists.filter((a) => a.metaobjectId);
    return filtered;
  }, [artists]);

  const handleImport = async () => {
    setImporting(true);
    setImportMessage(null);
    try {
      const res = await fetch("/api/orders/import-from-shopify?limit=25", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Import failed");
      }
      const json = await res.json();
      setImportMessage(`Imported ${json.importedCount ?? 0} orders`);
      // refresh orders
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (computedDateRange.start) params.set("start", computedDateRange.start);
      if (computedDateRange.end) params.set("end", computedDateRange.end);
      if (artistFilter !== "all") params.set("artistMetaobjectId", artistFilter);
      await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((json) => setOrders(Array.isArray(json.orders) ? json.orders : []));
    } catch (err: any) {
      setError(err?.message ?? "Failed to import from Shopify");
    } finally {
      setImporting(false);
    }
  };

  const handleAddPosLine = () => {
    setPosLines((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        title: "",
        quantity: "1",
        unitPrice: "",
        saleType: "unknown",
        artist: "",
      },
    ]);
  };

  const handleRemovePosLine = (id: string) => {
    setPosLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const handleUpdatePosLine = (id: string, patch: Partial<{ title: string; quantity: string; unitPrice: string; saleType: "print" | "original" | "unknown"; artist: string }>) => {
    setPosLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const handleCreatePos = async () => {
    setPosError(null);
    setPosMessage(null);
    const cleanedLines = posLines.map((line) => ({
      ...line,
      title: line.title.trim(),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    }));

    if (cleanedLines.some((l) => !l.title)) {
      setPosError("Each line needs a title");
      return;
    }
    if (cleanedLines.some((l) => !Number.isFinite(l.quantity) || l.quantity <= 0)) {
      setPosError("Quantities must be > 0");
      return;
    }
    if (cleanedLines.some((l) => !Number.isFinite(l.unitPrice) || l.unitPrice < 0)) {
      setPosError("Unit prices must be >= 0");
      return;
    }
    setPosSaving(true);
    try {
      const res = await fetch("/api/orders/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createdAt: posDate ? new Date(posDate).toISOString() : undefined,
          note: posNote.trim() || undefined,
          lineItems: cleanedLines.map((line) => ({
            title: line.title,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            currency: "EUR",
            saleType: line.saleType,
            artistShopifyMetaobjectGid: line.artist || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Failed to create POS order");
      }
      setPosMessage("POS order created");
      setPosNote("");
      setPosDate(new Date().toISOString().slice(0, 10));
      setPosLines([
        {
          id: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2),
          title: "",
          quantity: "1",
          unitPrice: "",
          saleType: "unknown",
          artist: "",
        },
      ]);
      setShowPosForm(false);
      // reload
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (computedDateRange.start) params.set("start", computedDateRange.start);
      if (computedDateRange.end) params.set("end", computedDateRange.end);
      if (artistFilter !== "all") params.set("artistMetaobjectId", artistFilter);
      await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((json) => setOrders(Array.isArray(json.orders) ? json.orders : []));
    } catch (err: any) {
      setPosError(err?.message ?? "Failed to create POS order");
    } finally {
      setPosSaving(false);
    }
  };

  const renderedOrders = useMemo(() => {
    return orders.map((o) => ({
      ...o,
      formattedDate: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "",
      formattedGross: `${o.gross.toFixed(2)} ${o.currency || ""}`.trim(),
    }));
  }, [orders]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-sm text-slate-500">Sales</p>
          <h1 className="text-2xl font-semibold">Orders</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="inline-flex items-center rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {importing ? "Importing..." : "Import from Shopify"}
          </button>
          <button
            type="button"
            onClick={() => setShowPosForm((v) => !v)}
            className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm"
          >
            New POS order
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Source
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="all">All</option>
            <option value="shopify">Shopify</option>
            <option value="pos">POS</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Date range
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="last90">Last 90 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Artist
          <select
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            {artistsLoading && <option>Loading artists...</option>}
            {!artistsLoading &&
              artistOptions.map((a) => (
                <option key={a.metaobjectId} value={a.metaobjectId!}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        {dateRange === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              From
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              To
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </label>
          </div>
        )}
      </div>

      {showPosForm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">POS</p>
                <h3 className="text-lg font-semibold text-slate-800">New POS order</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPosForm(false)}
                className="text-sm text-slate-600 underline"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Date
                <input
                  type="date"
                  value={posDate}
                  onChange={(e) => setPosDate(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Note
                <input
                  value={posNote}
                  onChange={(e) => setPosNote(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Optional note"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">Line items</div>
                <button
                  type="button"
                  onClick={handleAddPosLine}
                  className="text-sm text-blue-600 underline"
                >
                  Add line
                </button>
              </div>

              {posLines.map((line) => (
                <div key={line.id} className="rounded border border-slate-200 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Title
                      <input
                        value={line.title}
                        onChange={(e) => handleUpdatePosLine(line.id, { title: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        placeholder="Item title"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => handleUpdatePosLine(line.id, { quantity: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Unit price
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => handleUpdatePosLine(line.id, { unitPrice: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        placeholder="100.00"
                      />
                    </label>
                  </div>

                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Sale type
                      <select
                        value={line.saleType}
                        onChange={(e) => handleUpdatePosLine(line.id, { saleType: e.target.value as any })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="print">Print</option>
                        <option value="original">Original</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Artist
                      <select
                        value={line.artist}
                        onChange={(e) => handleUpdatePosLine(line.id, { artist: e.target.value })}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        <option value="">Unassigned</option>
                        {artistOptions.map((a) => (
                          <option key={a.metaobjectId} value={a.metaobjectId!}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemovePosLine(line.id)}
                        className="text-sm text-red-600 underline"
                        disabled={posLines.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {posError && <p className="mt-3 text-sm text-red-600">{posError}</p>}
            {posMessage && <p className="mt-1 text-sm text-green-600">{posMessage}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPosForm(false)}
                className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePos}
                disabled={posSaving}
                className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {posSaving ? "Saving..." : "Save POS order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {importMessage && <p className="text-sm text-green-600">{importMessage}</p>}

      <div className="overflow-auto rounded border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Order</th>
              <th className="px-3 py-2 text-left">Items</th>
              <th className="px-3 py-2 text-left">Gross</th>
              <th className="px-3 py-2 text-left">Assigned</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={7}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && renderedOrders.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={7}>
                  No orders yet.
                </td>
              </tr>
            )}
            {!loading &&
              renderedOrders.map((order) => (
                <tr
                  key={`${order.source}-${order.id}`}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-3 py-3 whitespace-nowrap">{order.formattedDate}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-700">
                      {order.source}
                    </span>
                  </td>
                  <td className="px-3 py-3">{order.label || order.id}</td>
                  <td className="px-3 py-3">{order.lineItemCount}</td>
                  <td className="px-3 py-3">{order.formattedGross}</td>
                  <td className="px-3 py-3">
                    {order.artistMetaobjectGids.length > 0 ? order.artistMetaobjectGids.length : 0}
                    {order.unassignedCount > 0 && <span className="text-xs text-slate-500"> ({order.unassignedCount} unassigned)</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{order.status || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-slate-500">Order</p>
                <h3 className="text-lg font-semibold text-slate-800">{selectedOrder.label}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-sm text-slate-600 underline"
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                <strong>Source:</strong> {selectedOrder.source.toUpperCase()}
              </p>
              <p>
                <strong>Date:</strong> {new Date(selectedOrder.createdAt).toLocaleString()}
              </p>
              <p>
                <strong>Gross:</strong> {`${selectedOrder.gross.toFixed(2)} ${selectedOrder.currency}`}
              </p>
              <p>
                <strong>Items:</strong> {selectedOrder.lineItemCount}
              </p>
              <p>
                <strong>Assigned artists:</strong>{" "}
                {selectedOrder.artistMetaobjectGids.length}{" "}
                {selectedOrder.unassignedCount > 0 && `(Unassigned: ${selectedOrder.unassignedCount})`}
              </p>
              <p>
                <strong>Status:</strong> {selectedOrder.status || "—"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
