"use client";

import { useEffect, useMemo, useState } from "react";

type CatalogItemType = "artwork" | "event";
type VatRate = "0" | "7" | "19";

type CatalogItem = {
  id: string;
  type: CatalogItemType;
  title: string;
  sku: string | null;
  priceGrossCents: number;
  vatRate: 0 | 7 | 19;
  currency: "EUR";
  imageUrl: string | null;
  artistName: string | null;
  shopifyProductGid: string | null;
  shopifyVariantGid: string | null;
  tags: string[];
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type EventFormState = {
  title: string;
  sku: string;
  priceGrossCents: string;
  vatRate: VatRate;
  imageUrl: string;
  tags: string;
  isActive: boolean;
};

const initialEventForm: EventFormState = {
  title: "",
  sku: "",
  priceGrossCents: "",
  vatRate: "19",
  imageUrl: "",
  tags: "",
  isActive: true,
};

function eurosFromCents(value: number) {
  return (value / 100).toFixed(2);
}

function toTagsInput(tags: string[]) {
  return tags.join(", ");
}

function parseTagsInput(input: string) {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function PosSettingsClient() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [filterType, setFilterType] = useState<"all" | CatalogItemType>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventFormState>(initialEventForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pos/catalog", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; items?: CatalogItem[]; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to load catalog");
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load catalog";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const eventItems = useMemo(() => items.filter((item) => item.type === "event"), [items]);
  const artworkCount = useMemo(() => items.filter((item) => item.type === "artwork").length, [items]);
  const visibleItems = useMemo(() => {
    if (filterType === "all") return items;
    return items.filter((item) => item.type === filterType);
  }, [filterType, items]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(initialEventForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: CatalogItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      sku: item.sku || "",
      priceGrossCents: String(item.priceGrossCents),
      vatRate: String(item.vatRate) as VatRate,
      imageUrl: item.imageUrl || "",
      tags: toTagsInput(item.tags),
      isActive: item.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSyncArtworks = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/pos/catalog/sync-artworks", { method: "POST" });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            fetchedProducts?: number;
            upsertedCount?: number;
            modifiedCount?: number;
            error?: string;
          }
        | null;

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to sync artworks");
      }

      setSyncMessage(
        `Synced ${payload.fetchedProducts ?? 0} artworks (${payload.upsertedCount ?? 0} new, ${payload.modifiedCount ?? 0} updated).`,
      );
      await loadCatalog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync artworks";
      setError(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveEvent = async () => {
    setFormError(null);
    const title = form.title.trim();
    const priceGrossCents = Number(form.priceGrossCents);
    if (!title) {
      setFormError("Title is required");
      return;
    }
    if (!Number.isFinite(priceGrossCents) || priceGrossCents < 0 || !Number.isInteger(priceGrossCents)) {
      setFormError("Price must be a non-negative integer (cents)");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        sku: form.sku.trim() || undefined,
        priceGrossCents,
        vatRate: form.vatRate,
        imageUrl: form.imageUrl.trim() || undefined,
        tags: parseTagsInput(form.tags),
        isActive: form.isActive,
      };

      const res = await fetch(
        editingId ? `/api/admin/pos/catalog/${encodeURIComponent(editingId)}` : "/api/admin/pos/catalog",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to save event item");
      }

      closeModal();
      await loadCatalog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save event item";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (id: string) => {
    const shouldDelete = window.confirm("Set this event item to inactive?");
    if (!shouldDelete) return;

    setError(null);
    try {
      const res = await fetch(`/api/admin/pos/catalog/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to deactivate event item");
      }
      await loadCatalog();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deactivate event item";
      setError(message);
    }
  };

  return (
    <main className="admin-dashboard">
      <header className="space-y-1">
        <p className="text-sm text-slate-500">POS</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-600">Configure terminals, locations, tax defaults, invoice thresholds, and catalog.</p>
      </header>

      <section className="card">
        <div className="cardHeader">
          <strong>Configuration Areas</strong>
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>Terminals</li>
          <li>Locations</li>
          <li>Tax rules</li>
          <li>Invoice thresholds</li>
        </ul>
      </section>

      <section className="card space-y-4">
        <div className="cardHeader">
          <div>
            <strong>Catalog</strong>
            <p className="text-sm text-slate-600 mt-1">Manage synced artwork items and custom event products.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btnGhost" onClick={handleSyncArtworks} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync artworks from Shopify"}
            </button>
            <button type="button" className="btnPrimary" onClick={openCreateModal}>
              New event item
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded border border-slate-200 px-3 py-1 text-slate-700">Artwork items: {artworkCount}</span>
          <span className="rounded border border-slate-200 px-3 py-1 text-slate-700">Event items: {eventItems.length}</span>
          <label className="inline-flex items-center gap-2">
            <span className="text-slate-600">View</span>
            <select
              className="rounded border border-slate-200 px-2 py-1"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as "all" | CatalogItemType)}
            >
              <option value="all">All</option>
              <option value="artwork">Artwork</option>
              <option value="event">Event</option>
            </select>
          </label>
        </div>

        {syncMessage && <p className="text-sm text-emerald-700">{syncMessage}</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="overflow-x-auto">
          <table className="ac-table min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Title</th>
                <th className="text-left">Type</th>
                <th className="text-left">Price</th>
                <th className="text-left">VAT</th>
                <th className="text-left">State</th>
                <th className="text-left">Source</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    No catalog items found.
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.type}</td>
                    <td>
                      €{eurosFromCents(item.priceGrossCents)} {item.currency}
                    </td>
                    <td>{item.vatRate}%</td>
                    <td>{item.isActive ? "active" : "inactive"}</td>
                    <td>{item.shopifyProductGid ? "Shopify" : "Manual"}</td>
                    <td className="text-right">
                      {item.type === "event" ? (
                        <div className="inline-flex gap-2">
                          <button type="button" className="btnGhost" onClick={() => openEditModal(item)}>
                            Edit
                          </button>
                          <button type="button" className="btnGhost" onClick={() => handleSoftDelete(item.id)}>
                            Deactivate
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-xl space-y-4">
            <div className="cardHeader">
              <strong>{editingId ? "Edit event item" : "New event item"}</strong>
              <button type="button" className="btnGhost" onClick={closeModal} disabled={saving}>
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm text-slate-600">Title</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-600">SKU</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  value={form.sku}
                  onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-600">Price (gross cents)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  value={form.priceGrossCents}
                  onChange={(event) => setForm((prev) => ({ ...prev, priceGrossCents: event.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-600">VAT</span>
                <select
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  value={form.vatRate}
                  onChange={(event) => setForm((prev) => ({ ...prev, vatRate: event.target.value as VatRate }))}
                >
                  <option value="0">0%</option>
                  <option value="7">7%</option>
                  <option value="19">19%</option>
                </select>
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm text-slate-600">Image URL</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  value={form.imageUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm text-slate-600">Tags (comma separated)</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  value={form.tags}
                  onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                />
              </label>
              <label className="inline-flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                <span className="text-sm text-slate-700">Active</span>
              </label>
            </div>

            {formError && <p className="text-sm text-rose-700">{formError}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" className="btnGhost" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btnPrimary" onClick={handleSaveEvent} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
