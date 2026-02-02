"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MediaItem = {
  id: string;
  filename?: string;
  url?: string;
  mimeType?: string;
  kind?: string;
};

type FormState = {
  title: string;
  shortDescription: string;
  widthCm: string;
  heightCm: string;
  offering: "print_only" | "original_plus_prints";
  originalPriceEur: string;
};

const initialForm: FormState = {
  title: "",
  shortDescription: "",
  widthCm: "",
  heightCm: "",
  offering: "print_only",
  originalPriceEur: "",
};

export default function NewArtworkSubmissionPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialForm);
  const [availableMedia, setAvailableMedia] = useState<MediaItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadMedia = async () => {
    setLoadingMedia(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/media?kind=artwork", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { media?: MediaItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load media");
      setAvailableMedia(Array.isArray(payload?.media) ? payload.media : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load media");
    } finally {
      setLoadingMedia(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const selectedMedia = useMemo(
    () => availableMedia.filter((m) => selectedMediaIds.includes(m.id)),
    [availableMedia, selectedMediaIds],
  );

  const toggleMedia = (id: string) => {
    setSelectedMediaIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const isImage = (mime?: string) => (mime || "").startsWith("image/");

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (selectedMediaIds.length === 0) {
      setError("Please select at least one artwork image");
      return;
    }
    if (form.offering === "original_plus_prints" && !form.originalPriceEur.trim()) {
      setError("Original price is required for originals");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        title: form.title.trim(),
        shortDescription: form.shortDescription.trim() || undefined,
        widthCm: form.widthCm ? Number(form.widthCm) : undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        offering: form.offering,
        originalPriceEur: form.offering === "original_plus_prints" ? Number(form.originalPriceEur) : undefined,
        mediaIds: selectedMediaIds,
      };

      const res = await fetch("/api/artist/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "artwork_create", payload }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error || "Failed to submit");

      setSuccess("Submitted. The team will review your artwork.");
      setForm(initialForm);
      setSelectedMediaIds([]);
      setTimeout(() => router.push("/artist/artworks"), 500);
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="artist-card space-y-2">
        <div className="artist-section-title">Submit new artwork</div>
        <div className="artist-section-sub">
          Pick your artwork images, add details, and send to the team. They will handle the Shopify publishing.
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/artist/artworks" className="artist-btn-ghost">
            Back to artworks
          </Link>
        </div>
      </div>

      <div className="artist-card space-y-4">
        <div>
          <div className="font-semibold text-slate-900">1) Select artwork images</div>
          <div className="text-sm text-slate-600">Pick at least one media tagged as “artwork”.</div>
        </div>

        {error && <div className="artist-placeholder">Error: {error}</div>}
        {success && <div className="artist-placeholder">{success}</div>}

        {loadingMedia ? (
          <div className="artist-placeholder">Loading media...</div>
        ) : availableMedia.length === 0 ? (
          <div className="artist-placeholder">No artwork media yet. Upload in Media and come back.</div>
        ) : (
          <div className="artist-grid">
            {availableMedia.map((m) => {
              const checked = selectedMediaIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMedia(m.id)}
                  className={`artist-media-card ${checked ? "ring-2 ring-slate-900" : ""}`}
                  style={{ alignItems: "flex-start" }}
                >
                  <div className="artist-media-preview" style={{ height: 140 }}>
                    {isImage(m.mimeType) && m.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.filename || "artwork"} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-xs text-slate-500">{m.filename || m.id}</div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{m.filename || "Untitled"}</div>
                </button>
              );
            })}
          </div>
        )}

        {selectedMedia.length > 0 && (
          <div className="artist-placeholder">Selected {selectedMedia.length} file(s)</div>
        )}
      </div>

      <div className="artist-card space-y-4">
        <div>
          <div className="font-semibold text-slate-900">2) Artwork details</div>
          <div className="text-sm text-slate-600">Provide a title and optional measurements.</div>
        </div>

        <div className="space-y-3">
          <Field
            label="Title"
            required
            value={form.title}
            onChange={(v) => setForm((s) => ({ ...s, title: v }))}
          />
          <Field
            label="Short description"
            value={form.shortDescription}
            onChange={(v) => setForm((s) => ({ ...s, shortDescription: v }))}
            textarea
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Width (cm)"
              value={form.widthCm}
              onChange={(v) => setForm((s) => ({ ...s, widthCm: v }))}
              type="number"
            />
            <Field
              label="Height (cm)"
              value={form.heightCm}
              onChange={(v) => setForm((s) => ({ ...s, heightCm: v }))}
              type="number"
            />
          </div>
        </div>
      </div>

      <div className="artist-card space-y-4">
        <div>
          <div className="font-semibold text-slate-900">3) Offering</div>
          <div className="text-sm text-slate-600">Choose whether you offer prints only or the original too.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "print_only", label: "Print only" },
            { key: "original_plus_prints", label: "Original + prints" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setForm((s) => ({ ...s, offering: opt.key as FormState["offering"] }))}
              className={`artist-btn-ghost ${form.offering === opt.key ? "ring-2 ring-slate-900" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {form.offering === "original_plus_prints" && (
          <Field
            label="Original price (EUR)"
            value={form.originalPriceEur}
            onChange={(v) => setForm((s) => ({ ...s, originalPriceEur: v }))}
            type="number"
            required
          />
        )}
      </div>

      <div className="artist-card space-y-3">
        <div className="text-sm text-slate-700">Review and submit your request.</div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="artist-btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit request"}
          </button>
          <Link href="/artist/artworks" className="artist-btn-ghost">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  textarea,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {required ? <span className="text-rose-600">*</span> : null}
      </div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder={label}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder={label}
          required={required}
        />
      )}
    </label>
  );
}
