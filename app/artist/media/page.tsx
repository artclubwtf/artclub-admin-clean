"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { Chip } from "@/components/ui/Chip";
import { FilePreview } from "@/components/ui/FilePreview";

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

type UploadOverlay = {
  percent: number;
  loaded: number;
  total: number;
  etaSeconds: number | null;
  fileCount: number;
  startedAt: number;
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

function formatEta(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds) || !Number.isFinite(seconds)) return "Berechne...";
  if (seconds < 1) return "<1s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${Math.max(1, secs)}s`;
  if (mins < 60) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins.toString().padStart(2, "0")}m`;
}

export default function ArtistMediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<MediaKind | "all">("all");
  const [uploadKind, setUploadKind] = useState<MediaKind>("artwork");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadOverlay, setUploadOverlay] = useState<UploadOverlay | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadRequestRef = useRef<XMLHttpRequest | null>(null);

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
    const selected = Array.from(files);
    const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);
    const startedAt = Date.now();
    let success = false;

    setUploading(true);
    setError(null);
    setMessage(null);
    setUploadOverlay({
      percent: 0,
      loaded: 0,
      total: totalBytes,
      etaSeconds: null,
      fileCount: selected.length,
      startedAt,
    });

    const formData = new FormData();
    formData.append("kind", uploadKind);
    selected.forEach((file) => formData.append("files", file));

    const sendWithProgress = () =>
      new Promise<{ media?: MediaItem[]; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadRequestRef.current = xhr;
        xhr.open("POST", "/api/artist/media");
        xhr.responseType = "json";

        xhr.upload.onprogress = (event) => {
          setUploadOverlay((prev) => {
            const base =
              prev ??
              ({
                percent: 0,
                loaded: 0,
                total: event.lengthComputable ? event.total : totalBytes,
                etaSeconds: null,
                fileCount: selected.length,
                startedAt,
              } satisfies UploadOverlay);
            if (!event.lengthComputable) return base;
            const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
            const speed = event.loaded / elapsedSeconds;
            const etaSeconds = speed > 0 ? (event.total - event.loaded) / speed : null;
            return {
              ...base,
              percent,
              loaded: event.loaded,
              total: event.total,
              etaSeconds,
            };
          });
        };

        xhr.onload = () => {
          const status = xhr.status;
          const header = xhr.getResponseHeader("content-type") || "";
          let payload: any = xhr.response;

          if (!payload && header.includes("application/json")) {
            try {
              payload = JSON.parse(xhr.responseText);
            } catch {
              payload = null;
            }
          }

          if (status >= 200 && status < 300) {
            resolve((payload as { media?: MediaItem[]; error?: string }) || {});
            return;
          }

          const serverError =
            (payload as { error?: string } | null)?.error ||
            (typeof payload === "string" ? payload : "") ||
            (xhr.responseText || "").slice(0, 180);

          let message = serverError || `Upload failed (status ${status || "network"})`;
          if (status === 413) {
            message = "Upload rejected: request is larger than the server limit (413). Please keep files under the configured max or restart the server after changing the limit.";
          } else if (status === 401 || status === 403) {
            message = "Not authorized to upload. Please log in again.";
          }

          reject(new Error(message));
        };

        xhr.onerror = () => reject(new Error("Upload failed (network error)"));
        xhr.onabort = () => reject(new Error("Upload canceled"));
        xhr.send(formData);
      });

    try {
      const payload = await sendWithProgress();
      const uploaded = Array.isArray(payload?.media) ? payload.media : [];
      setMedia((prev) => [...uploaded, ...prev]);
      setMessage(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`);
      setUploadOverlay((prev) =>
        prev
          ? {
              ...prev,
              percent: 100,
              loaded: prev.total || totalBytes,
              etaSeconds: 0,
            }
          : null,
      );
      success = true;
    } catch (err: any) {
      setError(err?.message ?? "Upload failed");
      setUploadOverlay(null);
    } finally {
      setUploading(false);
      uploadRequestRef.current = null;
      if (success) {
        setTimeout(() => setUploadOverlay(null), 900);
      }
    }
  };

  const cancelUpload = () => {
    uploadRequestRef.current?.abort();
    uploadRequestRef.current = null;
    setUploading(false);
    setUploadOverlay(null);
    setMessage(null);
    setError("Upload canceled.");
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
      {uploadOverlay && (
        <div className="artist-upload-modal" role="alertdialog" aria-live="assertive" aria-label="Upload progress">
          <div className="artist-upload-modal-card">
            <div className="artist-upload-modal-header">
              <div>
                <div className="artist-upload-title">Uploading…</div>
                <div className="artist-upload-sub">
                  {uploadOverlay.fileCount} file{uploadOverlay.fileCount === 1 ? "" : "s"} · {formatBytes(uploadOverlay.total)}
                </div>
              </div>
              <button type="button" className="artist-btn-ghost" onClick={cancelUpload} disabled={!uploading}>
                Cancel
              </button>
            </div>

            <div className="artist-progress-bar">
              <div
                className="artist-progress-bar-fill"
                style={{ width: `${Math.min(100, Math.max(0, uploadOverlay.percent))}%` }}
              />
            </div>
            <div className="artist-progress-meta">
              <span>{Math.round(uploadOverlay.percent)}%</span>
              <span>
                {uploadOverlay.loaded > 0 ? formatBytes(uploadOverlay.loaded) : "0 B"} /{" "}
                {uploadOverlay.total > 0 ? formatBytes(uploadOverlay.total) : "—"}
              </span>
              <span>{uploadOverlay.etaSeconds !== null ? `~${formatEta(uploadOverlay.etaSeconds)} left` : "Calculating time..."}</span>
            </div>
          </div>
        </div>
      )}

      <PageTitle
        title="Media"
        description="Upload, preview, and pick files for submissions or messages."
        actions={
          <div className="artist-segmented">
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

      <Card className="space-y-3">
        <CardHeader
          title="Upload"
          subtitle="Tap upload or drop files. Max 500MB each."
          action={
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as MediaKind)}
              className="artist-ghost-btn"
              style={{ padding: "9px 12px" }}
            >
              <option value="artwork">Artwork</option>
              <option value="social">Social</option>
              <option value="other">Other</option>
            </select>
          }
        />

        <div
          className={`artist-dropzone${dragging ? " dragging" : ""}`}
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
          <div className="artist-upload-actions">
            <div className="artist-section-sub">Drop files here or choose from your device.</div>
            <button type="button" className="artist-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
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
        <div className="artist-placeholder" style={{ marginTop: 10 }}>
            Max 500MB per file. Supported: images, pdf, video.
        </div>
      </div>

        {message && <div className="artist-placeholder">Success: {message}</div>}
        {error && <div className="artist-placeholder">Error: {error}</div>}
        {downloadError && <div className="artist-placeholder">Download error: {downloadError}</div>}
      </Card>

      <Card className="space-y-3">
        <CardHeader
          title="Library"
          subtitle={`Newest first · ${kindFilter === "all" ? "all kinds" : kindFilter}`}
          action={
            <button type="button" className="artist-btn-ghost" onClick={loadMedia} disabled={loading}>
              Refresh
            </button>
          }
        />

        {loading ? (
          <div className="artist-placeholder">Loading your media...</div>
        ) : filteredMedia.length === 0 ? (
          <EmptyState title="No media yet" description="Upload files to see them here." />
        ) : (
          <div className="artist-grid">
            {filteredMedia.map((item) => (
              <div key={item.id} className="artist-media-card">
                <FilePreview mimeType={item.mimeType} url={item.url} filename={item.filename || item.s3Key} height={140} />
                <div className="artist-media-meta">
                  <Chip label={item.kind} />
                  <div className="text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                </div>
                <div className="text-sm font-semibold text-slate-900">{item.filename || "Untitled"}</div>
                <div className="text-xs text-slate-500">
                  {item.mimeType || "unknown"} · {formatBytes(item.sizeBytes)}
                </div>
                <div className="artist-media-actions">
                  <button type="button" className="artist-btn-ghost" onClick={() => handleDownload(item)}>
                    Download
                  </button>
                  <button type="button" className="artist-btn-ghost" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
