"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type MediaItem = { id: string; filename: string; url: string; previewUrl: string };
type PrintSize = { code: string; label: string };
type Series = { id: string; name: string };

type DashboardPayload = { printSizes?: PrintSize[] };

export default function NewArtworkPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([]);
  const [series, setSeries] = useState<Series[]>([]);

  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [shortText, setShortText] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [offerings, setOfferings] = useState<"original_only" | "prints_only" | "original_plus_prints">("prints_only");
  const [originalPriceEur, setOriginalPriceEur] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [forSale, setForSale] = useState(true);
  const [allowPrints, setAllowPrints] = useState(true);
  const [originalAvailable, setOriginalAvailable] = useState(false);

  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [printSizeCodes, setPrintSizeCodes] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [mediaRes, dashboardRes, seriesRes] = await Promise.all([
          fetch("/api/artists/v2/media", { cache: "no-store" }),
          fetch("/api/artists/v2/dashboard", { cache: "no-store" }),
          fetch("/api/artists/v3/series", { cache: "no-store" }),
        ]);

        const mediaPayload = (await mediaRes.json().catch(() => null)) as { media?: MediaItem[]; error?: string } | null;
        if (!mediaRes.ok) throw new Error(mediaPayload?.error || "Failed to load media");

        const dashboardPayload = (await dashboardRes.json().catch(() => null)) as DashboardPayload | { error?: string } | null;
        if (!dashboardRes.ok) throw new Error((dashboardPayload as { error?: string } | null)?.error || "Failed to load print sizes");

        const seriesPayload = (await seriesRes.json().catch(() => null)) as { series?: Series[] } | null;

        if (active) {
          setMedia(Array.isArray(mediaPayload?.media) ? mediaPayload!.media : []);
          setPrintSizes(Array.isArray((dashboardPayload as DashboardPayload).printSizes) ? (dashboardPayload as DashboardPayload).printSizes! : []);
          setSeries(Array.isArray(seriesPayload?.series) ? seriesPayload!.series : []);
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load data");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const includePrints = offerings === "prints_only" || offerings === "original_plus_prints";

  useEffect(() => {
    setAllowPrints(includePrints);
    setOriginalAvailable(offerings === "original_only" || offerings === "original_plus_prints");
  }, [includePrints, offerings]);

  const selectedMedia = useMemo(() => media.filter((item) => mediaIds.includes(item.id)), [media, mediaIds]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (mediaIds.length === 0) {
      setError("Select at least one image.");
      return;
    }
    if (includePrints && printSizeCodes.length === 0) {
      setError("Select at least one print size.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/artists/v2/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          year: year.trim() ? Number(year) : undefined,
          dimensions: {
            widthCm: widthCm.trim() ? Number(widthCm) : undefined,
            heightCm: heightCm.trim() ? Number(heightCm) : undefined,
          },
          shortText: shortText.trim(),
          offerings,
          originalPriceEur: originalPriceEur.trim() ? Number(originalPriceEur) : undefined,
          printSizeCodes: includePrints ? printSizeCodes : [],
          mediaIds,
          seriesId: seriesId || undefined,
          forSale,
          allowPrints,
          originalAvailable,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; artwork?: { productKey?: string } } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to create artwork");
      }

      const productKey = payload?.artwork?.productKey;
      router.replace(productKey ? `/artists/artworks/${encodeURIComponent(productKey)}` : "/artists/artworks");
    } catch (err: any) {
      setError(err?.message || "Failed to create artwork");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="New artwork" subtitle="Create an artwork draft without Shopify IDs">
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading form…</div> : null}

      {!loading ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <SectionCard title="Details" subtitle="Core metadata">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>
              <label className="field">
                Year
                <input value={year} onChange={(e) => setYear(e.target.value)} type="number" />
              </label>
              <label className="field">
                Width (cm)
                <input value={widthCm} onChange={(e) => setWidthCm(e.target.value)} type="number" />
              </label>
              <label className="field">
                Height (cm)
                <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} type="number" />
              </label>
              <label className="field md:col-span-2">
                Short text
                <textarea rows={4} value={shortText} onChange={(e) => setShortText(e.target.value)} />
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Sales options" subtitle="Offerings and print setup">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Offerings
                <select value={offerings} onChange={(e) => setOfferings(e.target.value as any)}>
                  <option value="prints_only">Prints only</option>
                  <option value="original_only">Original only</option>
                  <option value="original_plus_prints">Original + prints</option>
                </select>
              </label>
              <label className="field">
                Series
                <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                  <option value="">No series</option>
                  {series.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Original price (EUR)
                <input value={originalPriceEur} onChange={(e) => setOriginalPriceEur(e.target.value)} type="number" />
              </label>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {printSizes.map((size) => (
                <label key={size.code} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={printSizeCodes.includes(size.code)}
                    onChange={(e) =>
                      setPrintSizeCodes((prev) =>
                        e.target.checked ? Array.from(new Set([...prev, size.code])) : prev.filter((code) => code !== size.code),
                      )
                    }
                  />
                  {size.label}
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={forSale} onChange={(e) => setForSale(e.target.checked)} />
                For sale
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allowPrints} onChange={(e) => setAllowPrints(e.target.checked)} />
                Allow prints
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={originalAvailable}
                  onChange={(e) => setOriginalAvailable(e.target.checked)}
                />
                Original available
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Images" subtitle="Choose from uploaded media">
            {media.length === 0 ? (
              <div className="text-sm text-slate-600">
                No uploaded media found. <Link href="/artists/media">Go to media upload.</Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {media.map((item) => {
                  const selected = mediaIds.includes(item.id);
                  const preview = item.previewUrl || item.url;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setMediaIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))
                      }
                      className={`rounded border p-2 text-left ${selected ? "border-slate-900" : "border-slate-200"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt={item.filename} className="h-32 w-full rounded object-cover" />
                      <div className="mt-1 text-xs text-slate-600">{item.filename || "media"}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedMedia.length > 0 ? (
              <div className="mt-3 text-xs text-slate-600">Selected: {selectedMedia.map((item) => item.filename).join(", ")}</div>
            ) : null}
          </SectionCard>

          <div className="flex justify-between">
            <Link href="/artists/artworks" className="btnGhost">
              Back
            </Link>
            <button className="btnPrimary" type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create artwork"}
            </button>
          </div>
        </form>
      ) : null}
    </PageShell>
  );
}
