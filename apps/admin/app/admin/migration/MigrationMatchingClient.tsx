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

export default function MigrationMatchingClient() {
  const [artists, setArtists] = useState<ImportedArtistRow[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [products, setProducts] = useState<ImportedProductRow[]>([]);
  const [artistOptions, setArtistOptions] = useState<ArtistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [artistSelections, setArtistSelections] = useState<Record<string, { linkedUserId: string; linkStatus: string }>>({});
  const [productSelections, setProductSelections] = useState<Record<string, { artistKey: string; migrationStatus: string }>>({});

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
      artistLinked: artists.filter((item) => item.linkStatus === "linked").length,
      productTotal: products.length,
      productAssigned: products.filter((item) => item.migrationStatus === "assigned").length,
    }),
    [artists, products],
  );

  async function confirmArtist(artistKey: string) {
    const selection = artistSelections[artistKey];
    if (!selection) return;

    setSavingKey(`artist:${artistKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/matches/artists/${encodeURIComponent(artistKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to confirm artist match");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm artist match");
    } finally {
      setSavingKey(null);
    }
  }

  async function confirmProduct(productKey: string) {
    const selection = productSelections[productKey];
    if (!selection) return;

    setSavingKey(`product:${productKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/matches/products/${encodeURIComponent(productKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to confirm product match");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm product match");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Imported artists</div>
          <div className="mt-2 text-2xl font-semibold">{summary.artistTotal}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Linked artists</div>
          <div className="mt-2 text-2xl font-semibold">{summary.artistLinked}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Imported products</div>
          <div className="mt-2 text-2xl font-semibold">{summary.productTotal}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Assigned products</div>
          <div className="mt-2 text-2xl font-semibold">{summary.productAssigned}</div>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Artist matching</h2>
              <p className="text-sm text-slate-600">Review imported Shopify artists and link them to existing artist user accounts.</p>
            </div>
            {loading ? <span className="text-xs text-slate-500">Loading…</span> : null}
          </div>

          <div className="mt-5 space-y-4">
            {!loading && artists.length === 0 ? <div className="text-sm text-slate-500">No imported artists waiting for review.</div> : null}
            {artists.map((artist) => {
              const selection = artistSelections[artist.artistKey] || { linkedUserId: "", linkStatus: artist.linkStatus };
              return (
                <div key={artist.artistKey} className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-medium">{artist.displayName || "Unnamed artist"}</div>
                      <div className="text-xs text-slate-500">{[artist.email, artist.handle, artist.publicSlug].filter(Boolean).join(" · ") || artist.artistKey}</div>
                      {artist.appUrl ? <div className="text-xs text-slate-500">app_url: {artist.appUrl}</div> : null}
                      {artist.vendorHints.length ? <div className="text-xs text-slate-500">Vendor hints: {artist.vendorHints.join(", ")}</div> : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">{artist.linkStatus}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Suggestions</div>
                    {artist.suggestions.length ? (
                      artist.suggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() =>
                            setArtistSelections((current) => ({
                              ...current,
                              [artist.artistKey]: { linkedUserId: suggestion.id, linkStatus: "suggested" },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-slate-900">{suggestion.label}</div>
                              <div className="text-xs text-slate-500">{[suggestion.email, suggestion.artistKey].filter(Boolean).join(" · ")}</div>
                            </div>
                            <div className="text-xs text-slate-500">{suggestion.score}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{suggestion.reasons.join(" · ")}</div>
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">No strong suggestions yet.</div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
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
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
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
                        <option value="unlinked">unlinked</option>
                        <option value="suggested">suggested</option>
                        <option value="linked">linked</option>
                        <option value="needs_review">needs_review</option>
                      </select>
                    </label>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void confirmArtist(artist.artistKey)}
                        disabled={savingKey === `artist:${artist.artistKey}`}
                        className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {savingKey === `artist:${artist.artistKey}` ? "Saving..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Product matching</h2>
              <p className="text-sm text-slate-600">Assign imported Shopify products to canonical artists without changing Shopify data.</p>
            </div>
            {loading ? <span className="text-xs text-slate-500">Loading…</span> : null}
          </div>

          <div className="mt-5 space-y-4">
            {!loading && products.length === 0 ? <div className="text-sm text-slate-500">No imported products waiting for review.</div> : null}
            {products.map((product) => {
              const selection = productSelections[product.productKey] || { artistKey: "", migrationStatus: product.migrationStatus };
              return (
                <div key={product.productKey} className="rounded-xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-medium">{product.title || "Untitled product"}</div>
                      <div className="text-xs text-slate-500">{[product.vendor, product.handle].filter(Boolean).join(" · ") || product.productKey}</div>
                      {product.artistRef ? <div className="text-xs text-slate-500">Shopify artist ref: {product.artistRef}</div> : null}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">{product.migrationStatus}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Suggestions</div>
                    {product.suggestions.length ? (
                      product.suggestions.map((suggestion) => (
                        <button
                          key={suggestion.artistKey}
                          type="button"
                          onClick={() =>
                            setProductSelections((current) => ({
                              ...current,
                              [product.productKey]: { artistKey: suggestion.artistKey, migrationStatus: "suggested" },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-slate-900">{suggestion.label}</div>
                              <div className="text-xs text-slate-500">{[suggestion.publicSlug, suggestion.artistKey].filter(Boolean).join(" · ")}</div>
                            </div>
                            <div className="text-xs text-slate-500">{suggestion.score}</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{suggestion.reasons.join(" · ")}</div>
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">No strong artist suggestions yet.</div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
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
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
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
                        <option value="unassigned">unassigned</option>
                        <option value="suggested">suggested</option>
                        <option value="assigned">assigned</option>
                        <option value="needs_review">needs_review</option>
                      </select>
                    </label>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => void confirmProduct(product.productKey)}
                        disabled={savingKey === `product:${product.productKey}`}
                        className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {savingKey === `product:${product.productKey}` ? "Saving..." : "Confirm"}
                      </button>
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
