"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ArtistOption = {
  artistKey: string;
  label: string;
  publicSlug: string;
  shopifyMetaobjectId: string;
};

type ProductSuggestion = ArtistOption & {
  score: number;
  reasons: string[];
};

type ProductRow = {
  productKey: string;
  title: string;
  vendor: string;
  handle: string;
  thumbUrl: string;
  artistKey: string;
  artistRef: string;
  shopifyProductId: string;
  legacyProductId: string;
  approvalStatus: string;
  type: string;
  migrationStatus: string;
  suggestions: ProductSuggestion[];
};

type Props = {
  initialProducts: ProductRow[];
  artistOptions: ArtistOption[];
};

type Bucket = "open" | "completed" | "error";

function badgeTone(status: string) {
  switch (status) {
    case "assigned":
    case "approved":
    case "published":
      return "bg-emerald-50 text-emerald-700";
    case "suggested":
    case "needs_review":
      return "bg-amber-50 text-amber-700";
    case "unassigned":
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function classifyBucket(product: ProductRow): Bucket {
  if (product.artistKey) return "completed";
  if (!product.suggestions.length && !product.vendor && !product.artistRef) return "error";
  return "open";
}

export default function ArtworkMatchingClient({ initialProducts, artistOptions }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<Bucket>("open");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, { artistKey: string; migrationStatus: ProductRow["migrationStatus"]; approvalStatus: string }>>(
    Object.fromEntries(
      initialProducts.map((product) => [
        product.productKey,
        {
          artistKey: product.artistKey || product.suggestions[0]?.artistKey || "",
          migrationStatus: product.migrationStatus,
          approvalStatus: product.approvalStatus || "needs_review",
        },
      ]),
    ),
  );

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesBucket = classifyBucket(product) === bucket;
      if (!matchesBucket) return false;
      if (!normalized) return true;
      return [product.title, product.vendor, product.handle, product.productKey, product.artistKey, product.shopifyProductId, product.legacyProductId]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [bucket, products, query]);

  async function saveProduct(product: ProductRow) {
    const next = formState[product.productKey];
    if (!next) return;
    const selectedArtist = artistOptions.find((option) => option.artistKey === next.artistKey) || product.suggestions[0] || null;
    const summary = selectedArtist
      ? `Dieses Kunstwerk wird ${selectedArtist.label} zugeordnet und direkt im kanonischen Produktdatensatz gespeichert.`
      : "Dieses Kunstwerk bleibt im Review-Status.";
    if (!window.confirm(`${summary}\n\nBestätigen?`)) return;

    setSavingKey(product.productKey);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/migration/artworks/${encodeURIComponent(product.productKey)}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            error?: string;
            artistKey?: string;
            artistRef?: string | null;
            migrationStatus?: ProductRow["migrationStatus"];
            approvalStatus?: string;
            type?: string;
          }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Artwork match failed");

      setProducts((current) =>
        current.map((item) =>
          item.productKey === product.productKey
            ? {
                ...item,
                artistKey: payload?.artistKey || "",
                artistRef: payload?.artistRef || "",
                migrationStatus: payload?.migrationStatus || item.migrationStatus,
                approvalStatus: payload?.approvalStatus || item.approvalStatus,
                type: payload?.type || item.type,
              }
            : item,
        ),
      );
      setMessage(
        selectedArtist
          ? `${product.title || product.productKey} wurde ${selectedArtist.label} zugeordnet und im Backend gespeichert.`
          : `${product.title || product.productKey} wurde aktualisiert.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Artwork match failed");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Artwork Matching</div>
            <h2 className="text-lg font-semibold text-slate-900">Kunstwerke separat prüfen und zuordnen</h2>
            <p className="text-sm text-slate-600">
              Diese Ansicht schreibt die Zuordnung direkt auf das kanonische Kunstwerk, damit Artist-Key, Artist-Ref, Status und Review-Felder im Backend sichtbar sind.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/artists-v2" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
              Zur Artistzentrale
            </Link>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search artworks</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titel, Vendor, Handle, IDs"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(["open", "completed", "error"] as Bucket[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setBucket(value)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${bucket === value ? "bg-black text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {value === "open" ? "Offen" : value === "completed" ? "Erledigt" : "Fehler"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="space-y-4">
        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
            Keine Kunstwerke in dieser Ansicht.
          </div>
        ) : null}

        {filteredProducts.map((product) => {
          const next = formState[product.productKey];
          const selectedArtist = artistOptions.find((option) => option.artistKey === next?.artistKey) || product.suggestions[0] || null;
          return (
            <article key={product.productKey} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row">
                {product.thumbUrl ? (
                  <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.thumbUrl} alt={product.title} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{product.title || product.productKey}</h3>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(product.migrationStatus)}`}>{product.migrationStatus}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(product.approvalStatus || "needs_review")}`}>{product.approvalStatus || "needs_review"}</span>
                  </div>
                  <div className="text-sm text-slate-500">
                    {[product.vendor, product.handle, product.productKey].filter(Boolean).join(" · ")}
                  </div>
                  <div className="grid gap-1 text-xs text-slate-500 md:grid-cols-2">
                    <div>Current artistKey: {product.artistKey || "—"}</div>
                    <div>Current artistRef: {product.artistRef || "—"}</div>
                    <div>Shopify product: {product.shopifyProductId || "—"}</div>
                    <div>Legacy product: {product.legacyProductId || "—"}</div>
                    <div>Type: {product.type || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Vorgeschlagener Artist</div>
                {selectedArtist ? (
                  <div className="mt-2">
                    <div className="font-medium text-slate-900">{selectedArtist.label}</div>
                    <div className="text-sm text-slate-500">{[selectedArtist.publicSlug, selectedArtist.artistKey].filter(Boolean).join(" · ")}</div>
                    {"reasons" in selectedArtist && Array.isArray(selectedArtist.reasons) ? (
                      <div className="mt-1 text-xs text-slate-500">Warum vorgeschlagen: {selectedArtist.reasons.join(" · ")}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">Kein Vorschlag vorhanden. Manuell auswählen.</div>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Artist auswählen</span>
                  <select
                    value={next?.artistKey || ""}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        [product.productKey]: {
                          ...current[product.productKey],
                          artistKey: event.target.value,
                          migrationStatus: event.target.value ? "assigned" : "needs_review",
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Kein Artist gewählt</option>
                    {artistOptions.map((option) => (
                      <option key={option.artistKey} value={option.artistKey}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Migration status</span>
                  <select
                    value={next?.migrationStatus || product.migrationStatus}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        [product.productKey]: {
                          ...current[product.productKey],
                          migrationStatus: event.target.value as ProductRow["migrationStatus"],
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="unassigned">unassigned</option>
                    <option value="suggested">suggested</option>
                    <option value="assigned">assigned</option>
                    <option value="needs_review">needs_review</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Approval status</span>
                  <select
                    value={next?.approvalStatus || product.approvalStatus || "needs_review"}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        [product.productKey]: {
                          ...current[product.productKey],
                          approvalStatus: event.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="needs_review">needs_review</option>
                    <option value="approved">approved</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveProduct(product)}
                  disabled={savingKey === product.productKey}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingKey === product.productKey ? "Speichert…" : "Artwork match speichern"}
                </button>
                <div className="text-xs text-slate-500">
                  Es werden `artistKey`, `artistRef`, `migrationStatus`, `approvalStatus`, `type=artwork` und Sync-Dirty-Felder direkt auf diesem kanonischen Kunstwerk gesetzt.
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
