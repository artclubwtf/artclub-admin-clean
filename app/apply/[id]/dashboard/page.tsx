"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const LAST_APPLICATION_KEY = "ac_application_last_id";

type ApplicationData = {
  id: string;
  status?: string;
  submittedAt?: string;
};

type MediaItem = {
  id: string;
  filename?: string;
  url?: string;
  previewUrl?: string;
  mimeType?: string;
  kind?: string;
  createdAt?: string;
};

type ArtworkItem = {
  id: string;
  title: string;
  shortDescription?: string;
  widthCm?: number;
  heightCm?: number;
  offering?: string;
  originalPriceEur?: number;
  mediaIds: string[];
  status?: string;
  createdAt?: string;
};

type ArtworkFormState = {
  title: string;
  shortDescription: string;
  widthCm: string;
  heightCm: string;
  offering: "print_only" | "original_plus_prints";
  originalPriceEur: string;
};

const initialArtworkForm: ArtworkFormState = {
  title: "",
  shortDescription: "",
  widthCm: "",
  heightCm: "",
  offering: "print_only",
  originalPriceEur: "",
};

function formatOffering(value?: string) {
  if (!value) return "—";
  return value === "original_plus_prints" ? "Original + Prints" : "Print only";
}

function statusLabel(value?: string | null) {
  if (!value) return "draft";
  return value.replace(/_/g, " ");
}

function isImage(mime?: string, filename?: string) {
  if (mime && mime.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|gif|webp|avif|heic)$/i.test(filename || "");
}

function isVideo(mime?: string, filename?: string) {
  if (mime && mime.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v)$/i.test(filename || "");
}

function isPdf(mime?: string, filename?: string) {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(filename || "");
}

function ApplyDashboardContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const rawId = (params as { id?: string | string[] })?.id;
  const applicationId = Array.isArray(rawId) ? rawId[0] : rawId || null;

  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [artworksLoading, setArtworksLoading] = useState(false);
  const [artworksError, setArtworksError] = useState<string | null>(null);
  const [artworkForm, setArtworkForm] = useState<ArtworkFormState>(initialArtworkForm);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [artworkSubmitting, setArtworkSubmitting] = useState(false);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [artworkSuccess, setArtworkSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    const queryToken = searchParams.get("token");
    let resolvedToken = queryToken;

    if (!resolvedToken) {
      resolvedToken = localStorage.getItem(applicationId) || null;
    }

    if (queryToken) {
      try {
        localStorage.setItem(applicationId, queryToken);
        localStorage.setItem(LAST_APPLICATION_KEY, applicationId);
      } catch (err) {
        console.warn("Failed to persist application token", err);
      }
    }

    setToken(resolvedToken);
    setTokenReady(true);
  }, [applicationId, searchParams]);

  const authHeaders = useMemo(() => {
    if (!token) return {} as Record<string, string>;
    return { "x-application-token": token };
  }, [token]);

  const loadApplication = useCallback(async () => {
    if (!applicationId || !token) return;
    setLoadError(null);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
        headers: authHeaders,
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load application");
      }
      setApplication(payload?.application ?? null);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load application");
    }
  }, [applicationId, token, authHeaders]);

  const loadMedia = useCallback(async () => {
    if (!applicationId || !token) return;
    setMediaLoading(true);
    setMediaError(null);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/media`, {
        headers: authHeaders,
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load media");
      }
      setMedia(Array.isArray(payload?.media) ? payload.media : []);
    } catch (err: any) {
      setMediaError(err?.message || "Failed to load media");
    } finally {
      setMediaLoading(false);
    }
  }, [applicationId, token, authHeaders]);

  const loadArtworks = useCallback(async () => {
    if (!applicationId || !token) return;
    setArtworksLoading(true);
    setArtworksError(null);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/artworks`, {
        headers: authHeaders,
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load artworks");
      }
      setArtworks(Array.isArray(payload?.artworks) ? payload.artworks : []);
    } catch (err: any) {
      setArtworksError(err?.message || "Failed to load artworks");
    } finally {
      setArtworksLoading(false);
    }
  }, [applicationId, token, authHeaders]);

  useEffect(() => {
    if (!applicationId || !token) {
      setLoading(false);
      return;
    }
    let active = true;
    const run = async () => {
      setLoading(true);
      await Promise.all([loadApplication(), loadMedia(), loadArtworks()]);
      if (active) setLoading(false);
    };
    void run();
    return () => {
      active = false;
    };
  }, [applicationId, token, loadApplication, loadMedia, loadArtworks]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!applicationId || !token) return;

    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });
      formData.append("kind", "artwork");

      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/media`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to upload media");
      }

      const created = Array.isArray(payload?.media) ? payload.media : [];
      setMedia((prev) => [...created, ...prev]);
      setUploadSuccess(`Uploaded ${created.length || files.length} file(s).`);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload media");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!applicationId || !token) return;
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/media/${encodeURIComponent(mediaId)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to delete media");
      }
      setMedia((prev) => prev.filter((item) => item.id !== mediaId));
      setSelectedMediaIds((prev) => prev.filter((id) => id !== mediaId));
    } catch (err: any) {
      setMediaError(err?.message || "Failed to delete media");
    }
  };

  const toggleMedia = (id: string) => {
    setSelectedMediaIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleCreateArtwork = async () => {
    if (!applicationId || !token) return;
    setArtworkError(null);
    setArtworkSuccess(null);

    if (!artworkForm.title.trim()) {
      setArtworkError("Title is required");
      return;
    }
    if (selectedMediaIds.length === 0) {
      setArtworkError("Select at least one artwork image");
      return;
    }
    if (artworkForm.offering === "original_plus_prints" && !artworkForm.originalPriceEur.trim()) {
      setArtworkError("Original price is required for originals");
      return;
    }

    setArtworkSubmitting(true);

    try {
      const payload = {
        title: artworkForm.title.trim(),
        shortDescription: artworkForm.shortDescription.trim() || undefined,
        widthCm: artworkForm.widthCm ? Number(artworkForm.widthCm) : undefined,
        heightCm: artworkForm.heightCm ? Number(artworkForm.heightCm) : undefined,
        offering: artworkForm.offering,
        originalPriceEur:
          artworkForm.offering === "original_plus_prints" ? Number(artworkForm.originalPriceEur) : undefined,
        mediaIds: selectedMediaIds,
      };

      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/artworks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to save artwork");
      }

      if (body?.artwork) {
        setArtworks((prev) => [body.artwork, ...prev]);
      }
      setArtworkForm(initialArtworkForm);
      setSelectedMediaIds([]);
      setArtworkSuccess("Artwork saved as draft.");
    } catch (err: any) {
      setArtworkError(err?.message || "Failed to save artwork");
    } finally {
      setArtworkSubmitting(false);
    }
  };

  if (!applicationId) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <h1 className="text-xl font-semibold text-slate-900">Application not found</h1>
          <p className="mt-2 text-sm text-slate-600">We could not locate your application. Please check your link.</p>
        </div>
      </div>
    );
  }

  if (!tokenReady) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <p className="text-sm text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <h1 className="text-xl font-semibold text-slate-900">Missing access token</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use the dashboard link provided after submission so we can verify your application.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <p className="text-sm text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const selectedMedia = media.filter((item) => selectedMediaIds.includes(item.id));

  return (
    <div className="ap-shell">
      <div className="ap-card">
        <div className="ap-eyebrow">Application</div>
        <h1 className="ap-title">Light dashboard</h1>
        <p className="ap-subtitle">
          Upload as many artworks as possible. The more you share, the easier it is to review your style.
        </p>

        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Status: {statusLabel(application?.status)}
        </div>
        {loadError ? <div className="text-sm font-semibold text-red-600">{loadError}</div> : null}
      </div>

      <div className="ap-card">
        <div className="ap-card-title">Upload artworks</div>
        <p className="ap-note">Recommended: as many as possible. Supported: JPG, PNG, HEIC, WEBP, MP4, PDF. Max 20MB.</p>
        <div
          className={`ap-dropzone ${dragActive ? "ap-dropzone-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void handleUpload(event.dataTransfer.files);
          }}
        >
          <label className="btnPrimary">
            {uploading ? "Uploading..." : "Upload artworks"}
            <input
              type="file"
              accept="image/*,video/*,application/pdf"
              multiple
              className="sr-only"
              onChange={(event) => {
                void handleUpload(event.target.files);
                event.currentTarget.value = "";
              }}
              disabled={uploading}
            />
          </label>
          <span className="text-xs text-slate-500">Drag & drop files here</span>
          <span className="text-xs text-slate-500">{media.length} upload(s)</span>
        </div>
        {uploadError ? <div className="text-xs font-semibold text-red-600">{uploadError}</div> : null}
        {uploadSuccess ? <div className="text-xs font-semibold text-emerald-700">{uploadSuccess}</div> : null}
      </div>

      <div className="ap-card">
        <div className="ap-card-title">Uploaded media</div>
        <p className="ap-note">Select media to create a draft artwork.</p>

        {mediaError ? <div className="text-sm text-red-600">{mediaError}</div> : null}

        {mediaLoading ? (
          <div className="text-sm text-slate-600">Loading media...</div>
        ) : media.length === 0 ? (
          <div className="text-sm text-slate-600">No uploads yet. Add your first artwork image above.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((item) => {
              const selected = selectedMediaIds.includes(item.id);
              const previewSrc = item.previewUrl || item.url;
              const showImage = !!previewSrc && isImage(item.mimeType, item.filename);
              const showVideo = !!previewSrc && isVideo(item.mimeType, item.filename);
              const showPdf = isPdf(item.mimeType, item.filename);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border ${selected ? "border-slate-900" : "border-slate-200"} bg-white p-3`}
                >
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-3"
                    onClick={() => toggleMedia(item.id)}
                  >
                    <div className="h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                      {showImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewSrc} alt={item.filename || "Artwork"} className="h-full w-full object-cover" />
                      ) : showVideo ? (
                        <video
                          className="h-full w-full object-cover"
                          src={previewSrc}
                          controls
                          preload="metadata"
                          onClick={(event) => event.stopPropagation()}
                        />
                      ) : showPdf ? (
                        <div className="flex h-full w-full flex-col items-center justify-center text-xs text-slate-500">
                          <span className="text-sm font-semibold text-slate-700">PDF</span>
                          <span>{item.filename || "Document"}</span>
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                          {item.filename || "Media"}
                        </div>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{item.filename || "Untitled"}</div>
                    <div className="text-xs text-slate-500">{selected ? "Selected" : "Click to select"}</div>
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button type="button" className="btnGhost" onClick={() => toggleMedia(item.id)}>
                      {selected ? "Deselect" : "Select"}
                    </button>
                    <button type="button" className="btnGhost" onClick={() => handleDeleteMedia(item.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ap-card">
        <div className="ap-card-title">Create artwork draft</div>
        <p className="ap-note">Use the selected media to create a draft artwork entry.</p>

        {artworkError ? <div className="text-sm text-red-600">{artworkError}</div> : null}
        {artworkSuccess ? <div className="text-sm text-emerald-700">{artworkSuccess}</div> : null}

        <div className="grid gap-4">
            <label className="field">
              Title
              <input
                type="text"
                value={artworkForm.title}
                onChange={(event) => setArtworkForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Artwork title"
              />
            </label>
            <label className="field">
              Short description
              <textarea
                value={artworkForm.shortDescription}
                onChange={(event) => setArtworkForm((prev) => ({ ...prev, shortDescription: event.target.value }))}
                placeholder="Short description"
                rows={3}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                Width (cm)
                <input
                  type="number"
                  value={artworkForm.widthCm}
                  onChange={(event) => setArtworkForm((prev) => ({ ...prev, widthCm: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="field">
                Height (cm)
                <input
                  type="number"
                  value={artworkForm.heightCm}
                  onChange={(event) => setArtworkForm((prev) => ({ ...prev, heightCm: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>
            <label className="field">
              Offering
              <select
                value={artworkForm.offering}
                onChange={(event) =>
                  setArtworkForm((prev) => ({ ...prev, offering: event.target.value as ArtworkFormState["offering"] }))
                }
              >
                <option value="print_only">Print only</option>
                <option value="original_plus_prints">Original + prints</option>
              </select>
            </label>
            {artworkForm.offering === "original_plus_prints" ? (
              <label className="field">
                Original price (EUR)
                <input
                  type="number"
                  value={artworkForm.originalPriceEur}
                  onChange={(event) => setArtworkForm((prev) => ({ ...prev, originalPriceEur: event.target.value }))}
                  placeholder="0"
                />
              </label>
            ) : null}

            <div className="ap-dropzone text-sm text-slate-600">
              Selected media: {selectedMedia.length}
              {selectedMedia.length ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                  {selectedMedia.map((item) => (
                    <span key={item.id} className="rounded-full bg-white px-2 py-1">
                      {item.filename || item.id}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <button type="button" className="btnPrimary" onClick={handleCreateArtwork} disabled={artworkSubmitting}>
                {artworkSubmitting ? "Saving..." : "Save artwork draft"}
              </button>
            </div>
          </div>
        </div>

      <div className="ap-card">
        <div className="ap-card-title">Submitted artworks</div>
        {artworksError ? <div className="text-sm text-red-600">{artworksError}</div> : null}

        {artworksLoading ? (
          <div className="text-sm text-slate-600">Loading artworks...</div>
        ) : artworks.length === 0 ? (
          <div className="text-sm text-slate-600">No artwork drafts yet.</div>
        ) : (
          <div className="space-y-3">
            {artworks.map((artwork) => (
              <div key={artwork.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{artwork.title}</div>
                    <div className="text-xs text-slate-500">
                      {formatOffering(artwork.offering)} · {artwork.mediaIds.length} image(s)
                    </div>
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {artwork.status || "draft"}
                  </div>
                </div>
                {artwork.shortDescription ? <p className="mt-2 text-sm text-slate-600">{artwork.shortDescription}</p> : null}
                {(artwork.widthCm || artwork.heightCm || artwork.originalPriceEur) && (
                  <div className="mt-2 text-xs text-slate-500">
                    {artwork.widthCm && artwork.heightCm ? `Size: ${artwork.widthCm}cm × ${artwork.heightCm}cm` : ""}
                    {artwork.originalPriceEur ? ` · Original €${artwork.originalPriceEur}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApplyDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="ap-shell">
          <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
            <p className="text-sm text-slate-600">Loading dashboard...</p>
          </div>
        </div>
      }
    >
      <ApplyDashboardContent />
    </Suspense>
  );
}
