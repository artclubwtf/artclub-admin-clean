"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { getSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const LAST_APPLICATION_KEY = "ac_application_last_id";

type ApplicationData = {
  id: string;
  status?: string;
  submittedAt?: string;
  rejectedAt?: string;
  personal?: {
    fullName?: string;
    email?: string;
    phone?: string;
    city?: string;
    country?: string;
  };
  shopify?: {
    instagramUrl?: string;
    quote?: string;
    einleitung_1?: string;
    text_1?: string;
    kategorieCollectionGid?: string;
  };
  legal?: {
    termsVersion?: string;
    acceptedAt?: string;
    acceptedName?: string;
  };
  profileImages?: {
    titelbildGid?: string;
    bild1Gid?: string;
    bild2Gid?: string;
    bild3Gid?: string;
  };
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

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
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
  const [sessionAvailable, setSessionAvailable] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
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
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);
  const [profilePreviews, setProfilePreviews] = useState<Record<string, string>>({});

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

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const session = await getSession();
        if (active) {
          setSessionAvailable(Boolean(session?.user));
        }
      } finally {
        if (active) setSessionChecked(true);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const authHeaders = useMemo(() => {
    if (!token) return {} as Record<string, string>;
    return { "x-application-token": token };
  }, [token]);

  useEffect(() => {
    const gids = [
      application?.profileImages?.titelbildGid,
      application?.profileImages?.bild1Gid,
      application?.profileImages?.bild2Gid,
      application?.profileImages?.bild3Gid,
    ]
      .filter((gid): gid is string => typeof gid === "string" && gid.trim().length > 0)
      .filter((gid) => !profilePreviews[gid]);

    if (!gids.length) return;

    let active = true;
    const run = async () => {
      try {
        const res = await fetch(`/api/shopify/resolve-media?ids=${encodeURIComponent(gids.join(","))}`, { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload) return;
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length || !active) return;
        setProfilePreviews((prev) => {
          const next = { ...prev };
          for (const item of items) {
            if (item?.id && item?.url) {
              next[item.id] = item.url;
            }
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to resolve profile images", err);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [application?.profileImages, profilePreviews]);

  const loadApplication = useCallback(async () => {
    if (!applicationId) return;
    setLoadError(null);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
        headers: authHeaders,
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load registration");
      }
      setApplication(payload?.application ?? null);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load registration");
    }
  }, [applicationId, token, authHeaders]);

  const loadMedia = useCallback(async () => {
    if (!applicationId) return;
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
    if (!applicationId) return;
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
    if (!applicationId || (!token && !sessionAvailable)) {
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
  }, [applicationId, token, sessionAvailable, loadApplication, loadMedia, loadArtworks]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!applicationId || (!token && !sessionAvailable)) return;

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
    if (!applicationId || (!token && !sessionAvailable)) return;
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

  const handleSelectAll = () => {
    setSelectedMediaIds(media.map((item) => item.id));
  };

  const handleClearSelection = () => {
    setSelectedMediaIds([]);
  };

  const handleCreateArtwork = async () => {
    if (!applicationId || (!token && !sessionAvailable)) return;
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
          <h1 className="text-xl font-semibold text-slate-900">Registration not found</h1>
          <p className="mt-2 text-sm text-slate-600">We could not locate your registration. Please check your link.</p>
        </div>
      </div>
    );
  }

  if (!tokenReady || !sessionChecked) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <p className="text-sm text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!token && !sessionAvailable) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <h1 className="text-xl font-semibold text-slate-900">Missing access token</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use the dashboard link provided after submission so we can verify your registration.
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
  const isLocked = application?.status === "rejected";
  const reapplyDate = application?.rejectedAt ? addMonths(new Date(application.rejectedAt), 6) : null;

  return (
    <div className="ap-shell">
      <div className="ap-card">
        <div className="ap-eyebrow">Registration</div>
        <h1 className="ap-title">Registrant dashboard</h1>
        <p className="ap-subtitle">
          Upload as many artworks as possible. The more you share, the easier it is to review your style.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Status: {statusLabel(application?.status)}</span>
          {application?.submittedAt ? <span>Submitted: {formatDate(application.submittedAt)}</span> : null}
        </div>
        {loadError ? <div className="text-sm font-semibold text-red-600">{loadError}</div> : null}
      </div>

      <div className="ap-card">
        <div className="ap-card-title">Review your registration</div>
        <div className="grid gap-3">
          <details className="ap-advanced" open>
            <summary className="text-sm font-semibold text-slate-800">Personal</summary>
            <div className="mt-2 text-sm text-slate-600">
              <div>{application?.personal?.fullName || "—"}</div>
              <div>{application?.personal?.email || "—"}</div>
              <div>{application?.personal?.phone || "—"}</div>
              <div>
                {application?.personal?.city || "—"} · {application?.personal?.country || "—"}
              </div>
            </div>
          </details>
          <details className="ap-advanced">
            <summary className="text-sm font-semibold text-slate-800">Shopify profile</summary>
            <div className="mt-2 space-y-2 text-sm text-slate-600">
              <div>Instagram: {application?.shopify?.instagramUrl || "—"}</div>
              <div>Quote: {application?.shopify?.quote || "—"}</div>
              <div>Intro: {application?.shopify?.einleitung_1 || "—"}</div>
              <div>Text: {application?.shopify?.text_1 || "—"}</div>
              <div>Category: {application?.shopify?.kategorieCollectionGid || "Assigned after review"}</div>
            </div>
          </details>
          <details className="ap-advanced">
            <summary className="text-sm font-semibold text-slate-800">Legal</summary>
            <div className="mt-2 space-y-2 text-sm text-slate-600">
              <div>Accepted name: {application?.legal?.acceptedName || "—"}</div>
              <div>Accepted at: {application?.legal?.acceptedAt ? formatDate(application.legal.acceptedAt) : "—"}</div>
              <div>Terms version: {application?.legal?.termsVersion || "—"}</div>
            </div>
          </details>
          <details className="ap-advanced">
            <summary className="text-sm font-semibold text-slate-800">Profile images</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                { label: "Titelbild", gid: application?.profileImages?.titelbildGid },
                { label: "Bild 1", gid: application?.profileImages?.bild1Gid },
                { label: "Bild 2", gid: application?.profileImages?.bild2Gid },
                { label: "Bild 3", gid: application?.profileImages?.bild3Gid },
              ].map((item) => {
                const previewUrl = item.gid ? profilePreviews[item.gid] : null;
                return (
                  <div key={item.label} className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</div>
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt={item.label} className="mt-2 h-24 w-full rounded-md object-cover" />
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">No image uploaded</div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </div>

      {isLocked ? (
        <div className="ap-card">
          <div className="ap-card-title">Registration locked</div>
          <p className="ap-note">
            Your registration was not accepted. You can re-register after {reapplyDate ? reapplyDate.toLocaleDateString() : "—"}.
          </p>
        </div>
      ) : (
        <>
          <div className="ap-card">
            <div className="ap-card-title">Upload artworks</div>
            <p className="ap-note">
              Recommended: as many as possible. Supported: JPG, PNG, HEIC, WEBP, MP4, PDF. Max 20MB.
            </p>
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <span>{selectedMedia.length} selected</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btnGhost" onClick={handleSelectAll} disabled={!media.length}>
                  Select all
                </button>
                <button type="button" className="btnGhost" onClick={handleClearSelection} disabled={!selectedMedia.length}>
                  Clear
                </button>
              </div>
            </div>

            {mediaError ? <div className="text-sm text-red-600">{mediaError}</div> : null}

            {mediaLoading ? (
              <div className="text-sm text-slate-600">Loading media...</div>
            ) : media.length === 0 ? (
              <div className="text-sm text-slate-600">No uploads yet. Add your first artwork image above.</div>
            ) : (
              <div className="ap-media-grid">
                {media.map((item) => {
                  const selected = selectedMediaIds.includes(item.id);
                  const previewSrc = item.previewUrl || item.url;
                  const showImage = !!previewSrc && isImage(item.mimeType, item.filename);
                  const showVideo = !!previewSrc && isVideo(item.mimeType, item.filename);
                  const showPdf = isPdf(item.mimeType, item.filename);
                  return (
                    <div key={item.id} className={`ap-media-tile ${selected ? "ap-media-selected" : ""}`}>
                      <div className="ap-media-checkbox">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMedia(item.id)}
                          />
                          Select
                        </label>
                        <button type="button" className="btnGhost" onClick={() => handleDeleteMedia(item.id)}>
                          Remove
                        </button>
                      </div>
                      <button type="button" className="ap-media-preview" onClick={() => setLightboxItem(item)}>
                        {showImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewSrc} alt={item.filename || "Artwork"} />
                        ) : showVideo ? (
                          <video src={previewSrc} preload="metadata" />
                        ) : showPdf ? (
                          <div className="ap-media-pdf">
                            <span className="text-sm font-semibold text-slate-700">PDF</span>
                            <span>{item.filename || "Document"}</span>
                            <span className="text-xs">Click to open</span>
                          </div>
                        ) : (
                          <div className="ap-media-fallback">{item.filename || "Media"}</div>
                        )}
                      </button>
                      <div className="ap-media-meta">
                        <div className="text-sm font-semibold text-slate-900">{item.filename || "Untitled"}</div>
                        <div className="text-xs text-slate-500">{selected ? "Selected" : "Click to preview"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 grid gap-4">
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

              {artworkError ? <div className="text-sm text-red-600">{artworkError}</div> : null}
              {artworkSuccess ? <div className="text-sm text-emerald-700">{artworkSuccess}</div> : null}

              <div>
                <button
                  type="button"
                  className="btnPrimary"
                  onClick={handleCreateArtwork}
                  disabled={artworkSubmitting || selectedMedia.length === 0}
                >
                  {artworkSubmitting
                    ? "Saving..."
                    : `Create draft from selected (${selectedMedia.length || 0})`}
                </button>
              </div>
            </div>
          </div>

          <div className="ap-card">
            <div className="ap-card-title">Draft artworks</div>
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
                    {artwork.shortDescription ? (
                      <p className="mt-2 text-sm text-slate-600">{artwork.shortDescription}</p>
                    ) : null}
                    {(artwork.widthCm || artwork.heightCm || artwork.originalPriceEur) && (
                      <div className="mt-2 text-xs text-slate-500">
                        {artwork.widthCm && artwork.heightCm ? `Size: ${artwork.widthCm}cm x ${artwork.heightCm}cm` : ""}
                        {artwork.originalPriceEur ? ` | Original €${artwork.originalPriceEur}` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {lightboxItem ? (
        <div className="ap-lightbox" onClick={() => setLightboxItem(null)}>
          <div className="ap-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <div className="ap-lightbox-header">
              <div>
                <div className="text-sm font-semibold text-slate-900">{lightboxItem.filename || "Media preview"}</div>
                <div className="text-xs text-slate-500">{lightboxItem.mimeType || "File"}</div>
              </div>
              <button type="button" className="btnGhost" onClick={() => setLightboxItem(null)}>
                Close
              </button>
            </div>
            <div className="ap-lightbox-body">
              {(() => {
                const previewSrc = lightboxItem.previewUrl || lightboxItem.url;
                if (previewSrc && isImage(lightboxItem.mimeType, lightboxItem.filename)) {
                  // eslint-disable-next-line @next/next/no-img-element
                  return <img src={previewSrc} alt={lightboxItem.filename || "Preview"} />;
                }
                if (previewSrc && isVideo(lightboxItem.mimeType, lightboxItem.filename)) {
                  return <video src={previewSrc} controls autoPlay />;
                }
                if (previewSrc && isPdf(lightboxItem.mimeType, lightboxItem.filename)) {
                  return (
                    <div className="ap-media-pdf">
                      <span className="text-sm font-semibold text-slate-700">PDF</span>
                      <a href={previewSrc} target="_blank" rel="noreferrer" className="text-xs underline">
                        Open / Download
                      </a>
                    </div>
                  );
                }
                return <div className="ap-media-fallback">Preview not available.</div>;
              })()}
            </div>
          </div>
        </div>
      ) : null}
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
