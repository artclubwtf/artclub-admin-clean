"use client";

import { useEffect, useMemo, useState } from "react";

type UserOption = {
  id: string;
  label: string;
  email: string;
  artistKey: string;
};

type ArtistSuggestion = UserOption & {
  score: number;
  reasons: string[];
};

type ImportedArtistRow = {
  artistKey: string;
  displayName: string;
  email: string;
  handle: string;
  publicSlug: string;
  shopifyMetaobjectId: string;
  appUrl: string;
  linkedUserId: string;
  vendorHints: string[];
  migrationStatus: string;
  linkStatus: "unlinked" | "suggested" | "linked" | "needs_review";
  suggestions: ArtistSuggestion[];
};

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

type ImportedProductRow = {
  productKey: string;
  title: string;
  vendor: string;
  handle: string;
  artistKey: string;
  artistRef: string;
  shopifyProductId: string;
  migrationStatus: "unassigned" | "suggested" | "assigned" | "needs_review";
  suggestions: ProductSuggestion[];
};

type Props = {
  onResult?: (message: string) => void;
};

type ResultState = {
  tone: "success" | "error";
  message: string;
} | null;

function badgeTone(status: string) {
  switch (status) {
    case "linked":
    case "assigned":
      return "bg-emerald-50 text-emerald-700";
    case "suggested":
    case "needs_review":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function MigrationMatchingClient({ onResult }: Props) {
  const [artists, setArtists] = useState<ImportedArtistRow[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [products, setProducts] = useState<ImportedProductRow[]>([]);
  const [artistOptions, setArtistOptions] = useState<ArtistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [artistSelections, setArtistSelections] = useState<Record<string, { linkedUserId: string; linkStatus: string }>>({});
  const [productSelections, setProductSelections] = useState<Record<string, { artistKey: string; migrationStatus: string }>>({});
  const [result, setResult] = useState<ResultState>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [artistsRes, productsRes] = await Promise.all([
        fetch("/api/admin/migration/matches/artists", { cache: "no-store" }),
        fetch("/api/admin/migration/matches/products", { cache: "no-store" }),
      ]);

      const [artistsJson, productsJson] = await Promise.all([artistsRes.json().catch(() => null), productsRes.json().catch(() => null)]);

      if (!artistsRes.ok) throw new Error(artistsJson?.error || "Failed to load artist matches");
      if (!productsRes.ok) throw new Error(productsJson?.error || "Failed to load product matches");

      const nextArtists = Array.isArray(artistsJson?.artists) ? artistsJson.artists : [];
      const nextProducts = Array.isArray(productsJson?.products) ? productsJson.products : [];
      const nextUserOptions = Array.isArray(artistsJson?.userOptions) ? artistsJson.userOptions : [];
      const nextArtistOptions = Array.isArray(productsJson?.artistOptions) ? productsJson.artistOptions : [];

      setArtists(nextArtists);
      setProducts(nextProducts);
      setUserOptions(nextUserOptions);
      setArtistOptions(nextArtistOptions);
      setArtistSelections(
        Object.fromEntries(
          nextArtists.map((item: ImportedArtistRow) => [
            item.artistKey,
            {
              linkedUserId: item.linkedUserId || item.suggestions[0]?.id || "",
              linkStatus: item.linkStatus || (item.suggestions.length ? "suggested" : "unlinked"),
            },
          ]),
        ),
      );
      setProductSelections(
        Object.fromEntries(
          nextProducts.map((item: ImportedProductRow) => [
            item.productKey,
            {
              artistKey: item.artistKey || item.suggestions[0]?.artistKey || "",
              migrationStatus: item.migrationStatus || (item.suggestions.length ? "suggested" : "unassigned"),
            },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matching data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(
    () => ({
      artistTotal: artists.length,
      artistSuggested: artists.filter((item) => item.suggestions.length > 0 || item.linkStatus === "suggested").length,
      productTotal: products.length,
      productSuggested: products.filter((item) => item.suggestions.length > 0 || item.migrationStatus === "suggested").length,
    }),
    [artists, products],
  );

  async function confirmArtist(artist: ImportedArtistRow) {
    const selection = artistSelections[artist.artistKey];
    if (!selection) return;
    const selectedUser = userOptions.find((option) => option.id === selection.linkedUserId) || artist.suggestions[0] || null;
    const summaryText = selectedUser
      ? `This links ${artist.displayName || artist.artistKey} to ${selectedUser.label}.`
      : `This stores ${artist.displayName || artist.artistKey} as ${selection.linkStatus}.`;
    if (!window.confirm(`${summaryText}\n\nThis only changes canonical matching data. Shopify stays untouched.`)) return;

    setSavingKey(`artist:${artist.artistKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/matches/artists/${encodeURIComponent(artist.artistKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to confirm artist match");
      const message = selectedUser
        ? `Artist match saved. ${artist.displayName || artist.artistKey} is now linked to ${selectedUser.label}.`
        : `Artist status saved for ${artist.displayName || artist.artistKey}.`;
      setResult({ tone: "success", message });
      onResult?.(message);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to confirm artist match";
      setError(message);
      setResult({ tone: "error", message });
    } finally {
      setSavingKey(null);
    }
  }

  async function confirmProduct(product: ImportedProductRow) {
    const selection = productSelections[product.productKey];
    if (!selection) return;
    const selectedArtist = artistOptions.find((option) => option.artistKey === selection.artistKey) || product.suggestions[0] || null;
    const summaryText = selectedArtist
      ? `This assigns ${product.title || product.productKey} to ${selectedArtist.label}.`
      : `This stores ${product.title || product.productKey} as ${selection.migrationStatus}.`;
    if (!window.confirm(`${summaryText}\n\nThis only updates canonical assignment. Shopify stays untouched.`)) return;

    setSavingKey(`product:${product.productKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/matches/products/${encodeURIComponent(product.productKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to confirm product match");
      const message = selectedArtist
        ? `Product assignment saved. ${product.title || product.productKey} is now assigned to ${selectedArtist.label}.`
        : `Product status saved for ${product.title || product.productKey}.`;
      setResult({ tone: "success", message });
      onResult?.(message);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to confirm product match";
      setError(message);
      setResult({ tone: "error", message });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Artist queue</div>
          <div className="mt-2 text-2xl font-semibold">{summary.artistTotal}</div>
          <div className="mt-1 text-xs text-slate-500">{summary.artistSuggested} with suggestions</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Product queue</div>
          <div className="mt-2 text-2xl font-semibold">{summary.productTotal}</div>
          <div className="mt-1 text-xs text-slate-500">{summary.productSuggested} with suggestions</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">What happens here?</div>
          <div className="mt-2 text-sm text-slate-600">Links imported artist records to canonical artists and existing artist users. Can be changed later by admin.</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Safety</div>
          <div className="mt-2 text-sm text-slate-600">All actions here are DB-only. Nothing in Shopify is written from these review queues.</div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {result ? (
        <div className={`rounded-xl px-4 py-3 text-sm ${result.tone === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
          {result.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Artist matching queue</h2>
            <p className="text-sm text-slate-600">Review imported artist records, understand the suggestion and confirm the final account link.</p>
            <p className="text-xs text-slate-500">Primary action: confirm the suggested user or choose one manually. Secondary action: keep the item as needs review.</p>
          </div>

          <div className="mt-5 space-y-4">
            {!loading && artists.length === 0 ? <div className="text-sm text-slate-500">No artist records need review right now.</div> : null}
            {artists.map((artist) => {
              const selection = artistSelections[artist.artistKey] || { linkedUserId: "", linkStatus: artist.linkStatus };
              const selectedUser = userOptions.find((option) => option.id === selection.linkedUserId) || artist.suggestions[0] || null;
              return (
                <div key={artist.artistKey} className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Imported artist</div>
                      <div className="font-medium text-slate-900">{artist.displayName || "Unnamed artist"}</div>
                      <div className="text-xs text-slate-500">{[artist.email, artist.handle, artist.publicSlug].filter(Boolean).join(" · ") || artist.artistKey}</div>
                      <div className="text-xs text-slate-500">Source: Shopify import{artist.appUrl ? ` · app_url ${artist.appUrl}` : ""}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(selection.linkStatus)}`}>{selection.linkStatus}</span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Suggested match</div>
                    {artist.suggestions.length ? (
                      <div className="mt-2 space-y-2">
                        {artist.suggestions.slice(0, 1).map((suggestion) => (
                          <div key={suggestion.id} className="space-y-1">
                            <div className="text-sm font-medium text-slate-900">{suggestion.label}</div>
                            <div className="text-xs text-slate-500">{[suggestion.email, suggestion.artistKey].filter(Boolean).join(" · ")}</div>
                            <div className="text-xs text-slate-600">Why this suggestion: {suggestion.reasons.join(" · ")}</div>
                            <button
                              type="button"
                              onClick={() =>
                                setArtistSelections((current) => ({
                                  ...current,
                                  [artist.artistKey]: { linkedUserId: suggestion.id, linkStatus: "suggested" },
                                }))
                              }
                              className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                            >
                              Use suggested match
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">No strong suggestion yet. Use manual selection below or leave it in review.</div>
                    )}
                  </div>

                  {artist.vendorHints.length ? (
                    <div className="text-xs text-slate-500">Additional context: vendor hints {artist.vendorHints.join(", ")}</div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Manual user selection</span>
                      <select
                        value={selection.linkedUserId}
                        onChange={(event) =>
                          setArtistSelections((current) => ({
                            ...current,
                            [artist.artistKey]: {
                              linkedUserId: event.target.value,
                              linkStatus: event.target.value ? "linked" : "needs_review",
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">No user selected</option>
                        {userOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} {option.email ? `· ${option.email}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Review status</span>
                      <select
                        value={selection.linkStatus}
                        onChange={(event) =>
                          setArtistSelections((current) => ({
                            ...current,
                            [artist.artistKey]: { ...selection, linkStatus: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="unlinked">Not started</option>
                        <option value="suggested">In progress</option>
                        <option value="linked">Completed</option>
                        <option value="needs_review">Needs review</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void confirmArtist(artist)}
                      disabled={savingKey === `artist:${artist.artistKey}`}
                      className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingKey === `artist:${artist.artistKey}` ? "Saving..." : "Confirm match"}
                    </button>
                    <div className="text-xs text-slate-500">
                      Links this imported artist to {selectedUser ? selectedUser.label : "the selected account"} in the canonical system.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Product matching queue</h2>
            <p className="text-sm text-slate-600">Assign imported products to the correct artist before any dry run or Shopify write happens.</p>
            <p className="text-xs text-slate-500">Primary action: confirm the proposed artist assignment. Secondary action: leave the item in review.</p>
          </div>

          <div className="mt-5 space-y-4">
            {!loading && products.length === 0 ? <div className="text-sm text-slate-500">No imported products need review right now.</div> : null}
            {products.map((product) => {
              const selection = productSelections[product.productKey] || { artistKey: "", migrationStatus: product.migrationStatus };
              const selectedArtist = artistOptions.find((option) => option.artistKey === selection.artistKey) || product.suggestions[0] || null;
              return (
                <div key={product.productKey} className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Imported product</div>
                      <div className="font-medium text-slate-900">{product.title || "Untitled product"}</div>
                      <div className="text-xs text-slate-500">{[product.vendor, product.handle].filter(Boolean).join(" · ") || product.productKey}</div>
                      <div className="text-xs text-slate-500">Source: Shopify product import{product.artistRef ? ` · artist ref ${product.artistRef}` : ""}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(selection.migrationStatus)}`}>{selection.migrationStatus}</span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Suggested artist</div>
                    {product.suggestions.length ? (
                      <div className="mt-2 space-y-2">
                        {product.suggestions.slice(0, 1).map((suggestion) => (
                          <div key={suggestion.artistKey} className="space-y-1">
                            <div className="text-sm font-medium text-slate-900">{suggestion.label}</div>
                            <div className="text-xs text-slate-500">{[suggestion.publicSlug, suggestion.artistKey].filter(Boolean).join(" · ")}</div>
                            <div className="text-xs text-slate-600">Why this suggestion: {suggestion.reasons.join(" · ")}</div>
                            <button
                              type="button"
                              onClick={() =>
                                setProductSelections((current) => ({
                                  ...current,
                                  [product.productKey]: { artistKey: suggestion.artistKey, migrationStatus: "suggested" },
                                }))
                              }
                              className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                            >
                              Use suggested artist
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">No strong artist suggestion yet. Choose manually or keep it in review.</div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Manual artist selection</span>
                      <select
                        value={selection.artistKey}
                        onChange={(event) =>
                          setProductSelections((current) => ({
                            ...current,
                            [product.productKey]: {
                              artistKey: event.target.value,
                              migrationStatus: event.target.value ? "assigned" : "needs_review",
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">No artist selected</option>
                        {artistOptions.map((option) => (
                          <option key={option.artistKey} value={option.artistKey}>
                            {option.label} {option.publicSlug ? `· ${option.publicSlug}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Review status</span>
                      <select
                        value={selection.migrationStatus}
                        onChange={(event) =>
                          setProductSelections((current) => ({
                            ...current,
                            [product.productKey]: { ...selection, migrationStatus: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="unassigned">Not started</option>
                        <option value="suggested">In progress</option>
                        <option value="assigned">Completed</option>
                        <option value="needs_review">Needs review</option>
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void confirmProduct(product)}
                      disabled={savingKey === `product:${product.productKey}`}
                      className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingKey === `product:${product.productKey}` ? "Saving..." : "Assign product"}
                    </button>
                    <div className="text-xs text-slate-500">
                      Connects this product to {selectedArtist ? selectedArtist.label : "the selected artist"} in the canonical DB.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
