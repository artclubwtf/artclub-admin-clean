"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ui from "../workspace-ui.module.css";

type Artwork = {
  id: string;
  productKey: string;
  title: string;
  status: string;
  offerings: string;
  forSale?: boolean;
  allowPrints?: boolean;
  seriesId?: string;
  seriesName?: string;
  updatedAt?: string;
  images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
};

type Series = { id: string; name: string };

export default function ArtistsArtworksPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Artwork[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [seriesFilter, setSeriesFilter] = useState("all");
  const [saleFilter, setSaleFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [artworksRes, seriesRes] = await Promise.all([
          fetch("/api/artists/v2/artworks", { cache: "no-store" }),
          fetch("/api/artists/v3/series", { cache: "no-store" }),
        ]);
        const artworksPayload = (await artworksRes.json().catch(() => null)) as { artworks?: Artwork[]; error?: string } | null;
        if (!artworksRes.ok) throw new Error(artworksPayload?.error || "Failed to load artworks");
        const seriesPayload = (await seriesRes.json().catch(() => null)) as { series?: Series[] } | null;

        if (active) {
          setItems(Array.isArray(artworksPayload?.artworks) ? artworksPayload?.artworks || [] : []);
          setSeries(Array.isArray(seriesPayload?.series) ? seriesPayload?.series || [] : []);
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load artworks");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (seriesFilter !== "all" && (item.seriesId || "") !== seriesFilter) return false;
      if (saleFilter === "for_sale" && item.forSale === false) return false;
      if (saleFilter === "not_for_sale" && item.forSale !== false) return false;
      if (syncFilter === "db_only" && item.status !== "db_only") return false;
      if (syncFilter === "synced" && item.status === "db_only") return false;
      return true;
    });
  }, [items, saleFilter, seriesFilter, statusFilter, syncFilter]);

  const updateArtwork = async (productKey: string, patch: { forSale?: boolean; allowPrints?: boolean }) => {
    setError(null);
    const previous = items;
    setItems((prev) =>
      prev.map((item) => (item.productKey === productKey ? { ...item, ...patch } : item)),
    );

    try {
      const res = await fetch(`/api/artists/v3/artworks/${encodeURIComponent(productKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to update artwork");
    } catch (err: any) {
      setItems(previous);
      setError(err?.message || "Failed to update artwork");
    }
  };

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      <div className={ui.headerRow}>
        <div>
          <div className={ui.pageTitle}>Artworks</div>
          <div className={ui.pageSub}>Manage your uploaded artworks and selling options</div>
        </div>
        <Link href="/artists/artworks/new" className="btnPrimary">
          New artwork
        </Link>
      </div>

      <div className={ui.filterBar}>
        <label className={ui.filterField}>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="db_only">db_only</option>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
        </label>

        <label className={ui.filterField}>
          Series
          <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}>
            <option value="all">All</option>
            {series.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className={ui.filterField}>
          For sale
          <select value={saleFilter} onChange={(e) => setSaleFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="for_sale">For sale</option>
            <option value="not_for_sale">Not for sale</option>
          </select>
        </label>

        <label className={ui.filterField}>
          Sync
          <select value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="db_only">DB only</option>
            <option value="synced">Synced</option>
          </select>
        </label>
      </div>

      {loading ? <div className={ui.muted}>Loading artworks...</div> : null}
      {loading === false && filtered.length === 0 ? <div className={ui.muted}>No artworks found.</div> : null}

      {loading === false && filtered.length > 0 ? (
        <div className={ui.artGrid}>
          {filtered.map((item) => {
            const image = item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl || "";
            const forSale = item.forSale !== false;
            const allowPrints = item.allowPrints === true;
            return (
              <div key={item.productKey} className={ui.artCard}>
                <Link href={`/artists/artworks/${encodeURIComponent(item.productKey)}`} className={ui.artImageWrap}>
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={item.title} className={ui.artImage} />
                  ) : null}
                  <span className={ui.artStatus}>{item.status === "db_only" ? "DB only" : "Synced"}</span>
                </Link>

                <div className={ui.artBody}>
                  <Link href={`/artists/artworks/${encodeURIComponent(item.productKey)}`} className={ui.artTitle}>
                    {item.title}
                  </Link>
                  <div className={ui.artMeta}>{item.seriesName || "No series"}</div>

                  <div className={ui.toggleRow}>
                    <span>For sale</span>
                    <label className={`${ui.switch} ${forSale ? ui.switchOn : ""}`.trim()}>
                      <input
                        type="checkbox"
                        checked={forSale}
                        onChange={(e) => void updateArtwork(item.productKey, { forSale: e.target.checked })}
                      />
                    </label>
                  </div>

                  <div className={ui.toggleRow}>
                    <span>Prints enabled</span>
                    <label className={`${ui.switch} ${allowPrints ? ui.switchOn : ""}`.trim()}>
                      <input
                        type="checkbox"
                        checked={allowPrints}
                        onChange={(e) => void updateArtwork(item.productKey, { allowPrints: e.target.checked })}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
