"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type ArtworkPayload = {
  ok: boolean;
  artwork: {
    productKey: string;
    title: string;
    description: string;
    shortText: string;
    year: number | null;
    offerings: "original_only" | "prints_only" | "original_plus_prints";
    forSale: boolean;
    allowPrints: boolean;
    originalAvailable: boolean;
    seriesId: string;
    seriesName: string;
    status: string;
    images: {
      thumbUrl: string;
      mediumUrl: string;
      originalUrl: string;
      galleryUrls: string[];
    };
  };
};

type Series = { id: string; name: string };

export default function ArtworkDetailPage() {
  const params = useParams<{ id: string }>();
  const artworkId = decodeURIComponent(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [artwork, setArtwork] = useState<ArtworkPayload["artwork"] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [artworkRes, seriesRes] = await Promise.all([
          fetch(`/api/artists/v3/artworks/${encodeURIComponent(artworkId)}`, { cache: "no-store" }),
          fetch("/api/artists/v3/series", { cache: "no-store" }),
        ]);

        const artworkPayload = (await artworkRes.json().catch(() => null)) as ArtworkPayload | { error?: string } | null;
        if (!artworkRes.ok) throw new Error((artworkPayload as { error?: string } | null)?.error || "Failed to load artwork");

        const seriesPayload = (await seriesRes.json().catch(() => null)) as { series?: Series[] } | null;

        if (active) {
          setArtwork((artworkPayload as ArtworkPayload).artwork);
          setSeries(Array.isArray(seriesPayload?.series) ? seriesPayload!.series : []);
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load artwork");
      } finally {
        if (active) setLoading(false);
      }
    };
    if (artworkId) void load();
    return () => {
      active = false;
    };
  }, [artworkId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!artwork) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/artists/v3/artworks/${encodeURIComponent(artworkId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: artwork.title,
          description: artwork.description,
          shortText: artwork.shortText,
          year: artwork.year,
          offerings: artwork.offerings,
          forSale: artwork.forSale,
          allowPrints: artwork.allowPrints,
          originalAvailable: artwork.originalAvailable,
          seriesId: artwork.seriesId || "",
        }),
      });
      const payload = (await res.json().catch(() => null)) as ArtworkPayload | { error?: string } | null;
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error || "Failed to save artwork");
      setArtwork((prev) => ({ ...prev!, ...(payload as ArtworkPayload).artwork }));
      setMessage("Artwork updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to save artwork");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Edit artwork" subtitle={artworkId} actions={<Link href="/artists/artworks" className="btnGhost">Back to list</Link>}>
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading artwork…</div> : null}

      {!loading && artwork ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <SectionCard title="Artwork details" subtitle="Edit core metadata and sale flags">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Title
                <input value={artwork.title} onChange={(e) => setArtwork((prev) => ({ ...prev!, title: e.target.value }))} />
              </label>
              <label className="field">
                Year
                <input
                  value={artwork.year ?? ""}
                  type="number"
                  onChange={(e) =>
                    setArtwork((prev) => ({ ...prev!, year: e.target.value ? Number(e.target.value) : null }))
                  }
                />
              </label>

              <label className="field md:col-span-2">
                Description
                <textarea
                  rows={5}
                  value={artwork.description}
                  onChange={(e) => setArtwork((prev) => ({ ...prev!, description: e.target.value }))}
                />
              </label>

              <label className="field md:col-span-2">
                Short text
                <textarea
                  rows={3}
                  value={artwork.shortText}
                  onChange={(e) => setArtwork((prev) => ({ ...prev!, shortText: e.target.value }))}
                />
              </label>

              <label className="field">
                Offerings
                <select
                  value={artwork.offerings}
                  onChange={(e) =>
                    setArtwork((prev) => ({ ...prev!, offerings: e.target.value as ArtworkPayload["artwork"]["offerings"] }))
                  }
                >
                  <option value="prints_only">Prints only</option>
                  <option value="original_only">Original only</option>
                  <option value="original_plus_prints">Original + prints</option>
                </select>
              </label>

              <label className="field">
                Series
                <select value={artwork.seriesId || ""} onChange={(e) => setArtwork((prev) => ({ ...prev!, seriesId: e.target.value }))}>
                  <option value="">No series</option>
                  {series.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={artwork.forSale}
                  onChange={(e) => setArtwork((prev) => ({ ...prev!, forSale: e.target.checked }))}
                />
                For sale
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={artwork.allowPrints}
                  onChange={(e) => setArtwork((prev) => ({ ...prev!, allowPrints: e.target.checked }))}
                />
                Allow prints
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={artwork.originalAvailable}
                  onChange={(e) => setArtwork((prev) => ({ ...prev!, originalAvailable: e.target.checked }))}
                />
                Original available
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Image preview" subtitle="Media assigned to this artwork">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[artwork.images.originalUrl, ...(artwork.images.galleryUrls || [])]
                .filter(Boolean)
                .map((url) => (
                  <div key={url} className="overflow-hidden rounded border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Artwork" className="h-36 w-full object-cover" />
                  </div>
                ))}
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button className="btnPrimary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      ) : null}
    </PageShell>
  );
}
