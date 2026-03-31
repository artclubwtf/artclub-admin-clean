"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import ui from "../../workspace-ui.module.css";

type MediaItem = { id: string; filename: string; url: string; previewUrl: string };
type PrintSize = { code: string; label: string };
type Series = { id: string; name: string };

type DashboardPayload = { printSizes?: PrintSize[] };

export default function NewArtworkPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

      setMedia(Array.isArray(mediaPayload?.media) ? mediaPayload?.media || [] : []);
      setPrintSizes(Array.isArray((dashboardPayload as DashboardPayload).printSizes) ? (dashboardPayload as DashboardPayload).printSizes || [] : []);
      setSeries(Array.isArray(seriesPayload?.series) ? seriesPayload?.series || [] : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (offerings === "original_only") {
      setAllowPrints(false);
      setOriginalAvailable(true);
      return;
    }
    if (offerings === "prints_only") {
      setAllowPrints(true);
      setOriginalAvailable(false);
      return;
    }
    setAllowPrints(true);
    setOriginalAvailable(true);
  }, [offerings]);

  const selectedMedia = useMemo(() => media.filter((item) => mediaIds.includes(item.id)), [media, mediaIds]);

  const onUploadFiles = async (files: FileList | null) => {
    if (files == null || files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const newIds: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/artists/v2/media/upload", { method: "POST", body: formData });
        const uploadPayload = (await uploadRes.json().catch(() => null)) as
          | {
              error?: string;
              file?: { filename?: string; mimeType?: string; sizeBytes?: number; url?: string; previewUrl?: string };
            }
          | null;
        if (!uploadRes.ok) throw new Error(uploadPayload?.error || "Upload failed");

        const saveRes = await fetch("/api/artists/v2/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "artwork",
            url: uploadPayload?.file?.url,
            previewUrl: uploadPayload?.file?.previewUrl || uploadPayload?.file?.url,
            filename: uploadPayload?.file?.filename || file.name,
            mimeType: uploadPayload?.file?.mimeType || file.type,
            sizeBytes: uploadPayload?.file?.sizeBytes || file.size,
          }),
        });
        const savePayload = (await saveRes.json().catch(() => null)) as
          | { error?: string; media?: { id?: string } }
          | null;
        if (!saveRes.ok) throw new Error(savePayload?.error || "Failed to save media");

        if (savePayload?.media?.id) newIds.push(savePayload.media.id);
      }

      await load();
      setMediaIds((prev) => Array.from(new Set([...prev, ...newIds])));
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleMediaId = (id: string) => {
    setMediaIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const togglePrintSize = (code: string) => {
    setPrintSizeCodes((prev) => {
      if (prev.includes(code)) return prev.filter((item) => item !== code);
      return [...prev, code];
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitEvent = event.nativeEvent as SubmitEvent;
    const submitter = submitEvent.submitter as HTMLButtonElement | null;
    const action = submitter?.value || "publish";

    setError(null);
    if (title.trim().length === 0) {
      setError("Title is required.");
      return;
    }
    if (mediaIds.length === 0) {
      setError("Please upload or select at least one image.");
      return;
    }
    if (allowPrints && printSizeCodes.length === 0) {
      setError("Please select at least one print size.");
      return;
    }

    const finalForSale = action === "draft" ? false : forSale;

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
          printSizeCodes: allowPrints ? printSizeCodes : [],
          mediaIds,
          seriesId: seriesId || undefined,
          forSale: finalForSale,
          allowPrints,
          originalAvailable,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; artwork?: { productKey?: string } } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to create artwork");

      const productKey = payload?.artwork?.productKey;
      router.replace(productKey ? `/artists/artworks/${encodeURIComponent(productKey)}` : "/artists/artworks");
    } catch (err: any) {
      setError(err?.message || "Failed to create artwork");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      {loading ? <div className={ui.muted}>Loading form...</div> : null}

      {loading === false ? (
        <form className={ui.createForm} onSubmit={onSubmit}>
          <div>
            <Link href="/artists/artworks" className="btnGhost">
              Back to artworks
            </Link>
            <div style={{ marginTop: 12 }} className={ui.pageTitle}>
              Create artwork
            </div>
            <div className={ui.pageSub}>Upload and configure your artwork</div>
          </div>

          <div className={ui.panel}>
            <div className={ui.cardTitle}>Images</div>
            <label className={ui.bigDrop}>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(event) => {
                  void onUploadFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <div>
                <div className={ui.dropText}>{uploading ? "Uploading images..." : "Drop images here or click to browse"}</div>
                <div className={ui.dropSub}>Support for JPG, PNG, WEBP up to 20MB</div>
              </div>
            </label>

            {media.length > 0 ? (
              <div className={ui.mediaPickGrid}>
                {media.map((item) => {
                  const selected = mediaIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${ui.mediaTile} ${selected ? ui.mediaTileSelected : ""}`.trim()}
                      onClick={() => toggleMediaId(item.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.previewUrl || item.url} alt={item.filename} />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className={ui.panel}>
            <div className={ui.cardTitle}>Basic information</div>
            <div className={ui.twoCol}>
              <label className={ui.inputField}>
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>
              <label className={ui.inputField}>
                Series (optional)
                <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
                  <option value="">Add to a series</option>
                  {series.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={ui.inputField} style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea rows={4} value={shortText} onChange={(e) => setShortText(e.target.value)} placeholder="Tell collectors about this work" />
              </label>
              <label className={ui.inputField}>
                Year
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </label>
              <label className={ui.inputField}>
                Offerings
                <select value={offerings} onChange={(e) => setOfferings(e.target.value as "original_only" | "prints_only" | "original_plus_prints")}>
                  <option value="prints_only">Prints only</option>
                  <option value="original_only">Original only</option>
                  <option value="original_plus_prints">Original + prints</option>
                </select>
              </label>
              <label className={ui.inputField}>
                Width (cm)
                <input type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
              </label>
              <label className={ui.inputField}>
                Height (cm)
                <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
              </label>
            </div>
          </div>

          <div className={ui.panel}>
            <div className={ui.cardTitle}>Sales options</div>
            <div className={ui.saleList}>
              <div className={ui.saleRow}>
                <div>
                  <div className={ui.saleTitle}>For sale</div>
                  <div className={ui.saleSub}>Enable this artwork for sale</div>
                </div>
                <label className={`${ui.switch} ${forSale ? ui.switchOn : ""}`.trim()}>
                  <input type="checkbox" checked={forSale} onChange={(e) => setForSale(e.target.checked)} />
                </label>
              </div>

              <div className={ui.saleRow}>
                <div>
                  <div className={ui.saleTitle}>Original available</div>
                  <div className={ui.saleSub}>Physical artwork for sale</div>
                </div>
                <label className={`${ui.switch} ${originalAvailable ? ui.switchOn : ""}`.trim()}>
                  <input type="checkbox" checked={originalAvailable} onChange={(e) => setOriginalAvailable(e.target.checked)} />
                </label>
              </div>

              <div className={ui.saleRow}>
                <div>
                  <div className={ui.saleTitle}>Prints enabled</div>
                  <div className={ui.saleSub}>Allow print sales of this work</div>
                </div>
                <label className={`${ui.switch} ${allowPrints ? ui.switchOn : ""}`.trim()}>
                  <input type="checkbox" checked={allowPrints} onChange={(e) => setAllowPrints(e.target.checked)} />
                </label>
              </div>
            </div>

            {originalAvailable ? (
              <div style={{ marginTop: 10 }}>
                <label className={ui.inputField}>
                  Original price (EUR)
                  <input type="number" value={originalPriceEur} onChange={(e) => setOriginalPriceEur(e.target.value)} />
                </label>
              </div>
            ) : null}
          </div>

          {allowPrints ? (
            <div className={ui.panel}>
              <div className={ui.cardTitle}>Print sizes</div>
              <div className={ui.pageSub}>Select available sizes. Prices are auto-calculated.</div>
              <div className={ui.sizesGrid}>
                {printSizes.map((size) => {
                  const selected = printSizeCodes.includes(size.code);
                  return (
                    <button
                      key={size.code}
                      type="button"
                      className={`${ui.sizeCard} ${selected ? ui.sizeCardSelected : ""}`.trim()}
                      onClick={() => togglePrintSize(size.code)}
                    >
                      <div className={ui.sizeLabel}>{size.label}</div>
                      <div className={ui.sizePrice}>Auto price</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className={ui.bottomActions}>
            <button className="btnGhost" type="submit" value="draft" disabled={saving}>
              {saving ? "Saving..." : "Save draft"}
            </button>
            <button className="btnPrimary" type="submit" value="publish" disabled={saving}>
              {saving ? "Publishing..." : "Publish to ARTCLUB"}
            </button>
          </div>

          {selectedMedia.length > 0 ? (
            <div className={ui.muted}>Selected: {selectedMedia.map((item) => item.filename || "image").join(", ")}</div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
