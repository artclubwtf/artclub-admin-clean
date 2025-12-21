"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilePreview } from "@/components/ui/FilePreview";
import { PageTitle } from "@/components/ui/PageTitle";
import { ApSection, ApSectionHeader } from "@/components/artist/ApElements";

type MediaKind = "artwork" | "social" | "other";

type MediaItem = {
  id: string;
  kind: MediaKind;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  s3Key?: string;
  url?: string;
  createdAt?: string;
};

const kindOptions: Array<{ value: MediaKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "artwork", label: "Artwork" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

function formatBytes(size?: number) {
  if (!size) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let val = size;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(date?: string) {
  if (!date) return "";
  return new Date(date).toLocaleString();
}

export default function ArtistMediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<MediaKind | "all">("all");
  const [uploadKind, setUploadKind] = useState<MediaKind>("artwork");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = kindFilter !== "all" ? `?kind=${encodeURIComponent(kindFilter)}` : "";
      const res = await fetch(`/api/artist/media${qs}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { media?: MediaItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load media");
      setMedia(Array.isArray(payload?.media) ? payload.media : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load media");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append("kind", uploadKind);
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const res = await fetch("/api/artist/media", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json().catch(() => null)) as { media?: MediaItem[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Upload failed");
      const uploaded = Array.isArray(payload?.media) ? payload?.media : [];
      setMedia((prev) => [...uploaded, ...prev]);
      setMessage(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`);
    } catch (err: any) {
      setError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/artist/media/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Delete failed");
      setMedia((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err?.message ?? "Delete failed");
    }
  };

  const handleDownload = async (item: MediaItem) => {
    setDownloadError(null);
    try {
      const directUrl = item.url;
      if (directUrl) {
        window.open(directUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const res = await fetch(`/api/artist/media/${encodeURIComponent(item.id)}/download`);
      const payload = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !payload?.url) throw new Error(payload?.error || "Download link unavailable");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setDownloadError(err?.message ?? "Download failed");
    }
  };

  const filteredMedia = useMemo(() => media, [media]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Media"
        description="Upload, preview, and pick files for submissions or messages."
        actions={
          <div className="ap-segmented">
            {kindOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={kindFilter === opt.value ? "active" : ""}
                onClick={() => setKindFilter(opt.value as MediaKind | "all")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      <ApSection>
        <ApSectionHeader
          title="Upload"
          subtitle="Tap upload or drop files. Max 20MB each."
          action={
            <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as MediaKind)} className="ap-btn-ghost">
              <option value="artwork">Artwork</option>
              <option value="social">Social</option>
              <option value="other">Other</option>
            </select>
          }
        />

        <div
          className={`ap-upload${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer?.files || null);
          }}
        >
          <div className="ap-upload-actions">
            <div className="ap-section-subtitle">Drop files here or choose from your device.</div>
            <button type="button" className="ap-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            accept="image/*,.pdf,video/*"
          />
          <div className="ap-note" style={{ marginTop: 10 }}>
            Max 20MB per file. Supported: images, pdf, video.
          </div>
        </div>

        {message && <div className="ap-note">Success: {message}</div>}
        {error && <div className="ap-note">Error: {error}</div>}
        {downloadError && <div className="ap-note">Download error: {downloadError}</div>}
      </ApSection>

      <ApSection>
        <ApSectionHeader
          title="Library"
          subtitle={`Newest first · ${kindFilter === "all" ? "all kinds" : kindFilter}`}
          action={
            <button type="button" className="ap-btn-ghost" onClick={loadMedia} disabled={loading}>
              Refresh
            </button>
          }
        />

        {loading ? (
          <div className="ap-note">Loading your media...</div>
        ) : filteredMedia.length === 0 ? (
          <div className="ap-note">No media yet. Upload files to see them here.</div>
        ) : (
          <div className="ap-grid">
            {filteredMedia.map((item) => (
              <div key={item.id} className="ap-media-tile">
                <div className="ap-media-thumb">
                  <FilePreview mimeType={item.mimeType} url={item.url} filename={item.filename || item.s3Key} height={140} />
                </div>
                <div className="ap-media-meta">
                  <span className="ap-pill">{item.kind}</span>
                  <div className="ap-text-muted text-xs">{formatDate(item.createdAt)}</div>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.filename || "Untitled"}</div>
                <div className="ap-text-muted text-xs">
                  {item.mimeType || "unknown"} · {formatBytes(item.sizeBytes)}
                </div>
                <div className="ap-media-actions">
                  <button type="button" className="ap-btn-ghost" onClick={() => handleDownload(item)}>
                    Download
                  </button>
                  <button type="button" className="ap-btn-ghost" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ApSection>
    </div>
  );
}
