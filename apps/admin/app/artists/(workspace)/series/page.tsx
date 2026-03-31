"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import ui from "../workspace-ui.module.css";

type SeriesItem = {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string;
  createdAt?: string;
  updatedAt?: string;
};

type Artwork = { productKey: string; seriesId?: string };

export default function ArtistsSeriesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [items, setItems] = useState<SeriesItem[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [seriesRes, artworksRes] = await Promise.all([
        fetch("/api/artists/v3/series", { cache: "no-store" }),
        fetch("/api/artists/v2/artworks", { cache: "no-store" }),
      ]);
      const seriesPayload = (await seriesRes.json().catch(() => null)) as { series?: SeriesItem[]; error?: string } | null;
      if (!seriesRes.ok) throw new Error(seriesPayload?.error || "Failed to load series");

      const artworksPayload = (await artworksRes.json().catch(() => null)) as { artworks?: Artwork[] } | null;
      setItems(Array.isArray(seriesPayload?.series) ? seriesPayload?.series || [] : []);
      setArtworks(Array.isArray(artworksPayload?.artworks) ? artworksPayload?.artworks || [] : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load series");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const artwork of artworks) {
      const key = artwork.seriesId || "";
      if (key.length === 0) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [artworks]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError("Series name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/artists/v3/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), coverImageUrl: coverImageUrl.trim() || undefined }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to create series");

      setName("");
      setDescription("");
      setCoverImageUrl("");
      setShowCreate(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to create series");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (window.confirm("Delete this series?") === false) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/artists/v3/series/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to delete series");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete series");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}

      <div className={ui.headerRow}>
        <div>
          <div className={ui.pageTitle}>Series</div>
          <div className={ui.pageSub}>Organize your artworks into collections</div>
        </div>
        <button className="btnPrimary" type="button" onClick={() => setShowCreate((prev) => prev === false)}>
          Create series
        </button>
      </div>

      {showCreate ? (
        <form className={ui.panel} onSubmit={onCreate}>
          <div className={ui.cardTitle}>New series</div>
          <div className={ui.twoCol} style={{ marginTop: 10 }}>
            <label className={ui.inputField}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className={ui.inputField}>
              Cover image URL (optional)
              <input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} />
            </label>
            <label className={ui.inputField} style={{ gridColumn: "1 / -1" }}>
              Description
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <div className={ui.rowActions} style={{ marginTop: 10 }}>
            <button className="btnGhost" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="btnPrimary" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Save series"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <div className={ui.muted}>Loading series...</div> : null}
      {loading === false && items.length === 0 ? <div className={ui.muted}>No series yet.</div> : null}

      {loading === false && items.length > 0 ? (
        <div className={ui.seriesGrid}>
          {items.map((item) => (
            <div key={item.id} className={ui.seriesCard}>
              {item.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.coverImageUrl} alt={item.name} className={ui.seriesImage} />
              ) : (
                <div className={ui.seriesImage} />
              )}

              <div className={ui.seriesBody}>
                <div className={ui.seriesTitle}>{item.name}</div>
                <div className={ui.seriesMeta}>{counts.get(item.id) || 0} artworks</div>
                <div className={ui.seriesDesc}>{item.description || "No description"}</div>
                <div className={ui.seriesActions}>
                  <Link href={`/artists/series/${encodeURIComponent(item.id)}`} className="btnGhost">
                    Edit
                  </Link>
                  <button
                    className="btnGhost"
                    type="button"
                    onClick={() => void onDelete(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
