"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Artist = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  stage?: string;
  shopifySync?: {
    metaobjectId?: string;
    handle?: string;
    lastSyncedAt?: string;
    lastSyncStatus?: string;
    lastSyncError?: string;
  };
};

type ShopifyArtist = {
  metaobjectId: string;
  handle?: string | null;
  displayName?: string | null;
  instagram?: string | null;
  bilder?: string | null;
  bild_1?: string | null;
  bild_2?: string | null;
  bild_3?: string | null;
  quote?: string | null;
  einleitung_1?: string | null;
  text_1?: string | null;
  kategorie?: string | null;
};

type ArtistListItem =
  | (Artist & { source: "db" })
  | (Pick<ShopifyArtist, "metaobjectId" | "displayName" | "instagram"> & { source: "shopify" });

const defaultStage = "Idea";

const stages = ["Idea", "In Review", "Offer", "Under Contract"] as const;

export default function ArtistsPageClient() {
  const router = useRouter();

  const [dbArtists, setDbArtists] = useState<Artist[]>([]);
  const [shopifyArtists, setShopifyArtists] = useState<ShopifyArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setActionError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (stageFilter) params.set("stage", stageFilter);

        const [dbRes, shopifyRes] = await Promise.all([
          fetch(`/api/artists?${params.toString()}`, { cache: "no-store" }),
          fetch("/api/shopify/artists", { cache: "no-store" }),
        ]);

        const [dbJson, shopifyJson] = await Promise.all([dbRes.json().catch(() => null), shopifyRes.json().catch(() => null)]);

        if (!dbRes.ok) {
          throw new Error(dbJson?.error || "Failed to load artists");
        }
        if (!shopifyRes.ok) {
          throw new Error(shopifyJson?.error || "Failed to load Shopify artists");
        }

        if (!active) return;
        setDbArtists(Array.isArray(dbJson?.artists) ? dbJson.artists : []);
        setShopifyArtists(Array.isArray(shopifyJson?.artists) ? shopifyJson.artists : []);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load artists");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [query, stageFilter, refreshToken]);

  const mergedArtists: ArtistListItem[] = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = (values: (string | null | undefined)[]) =>
      normalizedQuery ? values.some((v) => v?.toLowerCase().includes(normalizedQuery)) : true;

    const linkedMetaobjectIds = new Set(
      dbArtists.map((a) => (a.shopifySync?.metaobjectId || "").trim()).filter(Boolean),
    );

    const dbItems: ArtistListItem[] = dbArtists
      .filter((artist) => matchesQuery([artist.name, artist.email, artist.phone]))
      .map((artist) => ({
        ...artist,
        source: "db" as const,
        stage: artist.stage || defaultStage,
      }));

    const shopifyItems: ArtistListItem[] = stageFilter
      ? []
      : shopifyArtists
          .filter((artist) => !linkedMetaobjectIds.has(artist.metaobjectId))
          .filter((artist) => matchesQuery([artist.displayName, artist.instagram, artist.handle]))
          .map((artist) => ({
            source: "shopify" as const,
            metaobjectId: artist.metaobjectId,
            displayName: artist.displayName || artist.handle || "Unbenannt",
            instagram: artist.instagram || undefined,
          }));

    return [...dbItems, ...shopifyItems];
  }, [dbArtists, shopifyArtists, query, stageFilter]);

  const filteredCount = mergedArtists.length;

  const handleImport = async (metaobjectId: string) => {
    setActionError(null);
    setImportingId(metaobjectId);
    try {
      const res = await fetch("/api/artists/import-from-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaobjectId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to import artist");
      }
      const newId = payload?.artist?._id;
      if (!newId) {
        throw new Error("Import succeeded but returned no artist id");
      }
      setRefreshToken((n) => n + 1);
      router.push(`/admin/artists/${encodeURIComponent(newId)}`);
    } catch (err: any) {
      setActionError(err?.message || "Failed to import artist");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <section className="page space-y-6">
      <div className="card">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone"
            />
          </label>
          <label className="field">
            <span>Stage</span>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Artists</h2>
          {loading ? <span className="text-xs text-slate-500">Loading...</span> : <span className="text-xs text-slate-500">{filteredCount} total</span>}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}
        {!error && actionError && <p className="mt-2 text-sm text-red-600">Action error: {actionError}</p>}
        {!loading && !error && mergedArtists.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">No artists found.</p>
        )}

        <ul className="mt-4 grid gap-3">
          {mergedArtists.map((artist) => (
            <li
              key={artist.source === "db" ? artist._id : artist.metaobjectId}
              className="card transition hover:-translate-y-[1px]"
              style={{ padding: "14px" }}
            >
              {artist.source === "db" ? (
                <Link href={`/admin/artists/${artist._id}`} className="block space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{artist.name || "Unbenannt"}</div>
                    {artist.stage && <span className="text-xs text-slate-500">{artist.stage}</span>}
                  </div>
                  {(artist.email || artist.phone) && (
                    <div className="text-xs text-slate-500">
                      {[artist.email, artist.phone].filter(Boolean).join(" • ")}
                    </div>
                  )}
                </Link>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{artist.displayName || "Unbenannt"}</div>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        Shopify
                      </span>
                    </div>
                    {artist.instagram && <div className="text-xs text-slate-500">{artist.instagram}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleImport(artist.metaobjectId)}
                    disabled={importingId === artist.metaobjectId}
                    className="btnPrimary disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {importingId === artist.metaobjectId ? "Importing..." : "Import"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
