"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";

type ApplicationDetail = {
  application: {
    id: string;
    status: string;
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
    profileImages?: {
      titelbildGid?: string;
      bild1Gid?: string;
      bild2Gid?: string;
      bild3Gid?: string;
    };
    legal?: {
      termsVersion?: string;
      acceptedAt?: string;
      acceptedIp?: string;
      acceptedUserAgent?: string;
      acceptedName?: string;
    };
    admin?: {
      reviewerNote?: string;
      decisionNote?: string;
    };
    submittedAt?: string;
    reviewedAt?: string;
    acceptedAt?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  media: MediaItem[];
  artworks: ArtworkItem[];
};

type MediaItem = {
  id: string;
  kind?: string;
  filename?: string | null;
  url?: string | null;
  previewUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string | null;
};

type ArtworkItem = {
  id: string;
  title: string;
  shortDescription?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  offering?: string;
  originalPriceEur?: number | null;
  mediaIds: string[];
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type CollectionOption = {
  id: string;
  title: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatOffering(value?: string | null) {
  if (!value) return "—";
  return value === "original_plus_prints" ? "Original + Prints" : "Print only";
}

function isImage(mime?: string | null, filename?: string | null) {
  if (mime && mime.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|gif|webp|avif|heic)$/i.test(filename || "");
}

function isVideo(mime?: string | null, filename?: string | null) {
  if (mime && mime.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|m4v)$/i.test(filename || "");
}

function isPdf(mime?: string | null, filename?: string | null) {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(filename || "");
}

export default function AdminApplicationDetailPage() {
  const params = useParams();
  const rawId = (params as { id?: string | string[] })?.id;
  const applicationId = Array.isArray(rawId) ? rawId[0] : rawId || null;

  const [data, setData] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [profilePreviews, setProfilePreviews] = useState<Record<string, string>>({});
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryResults, setCategoryResults] = useState<CollectionOption[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null);

  const load = async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${encodeURIComponent(applicationId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApplicationDetail | { error?: string } | null;
      if (!res.ok || !payload || "error" in payload) {
        throw new Error((payload as { error?: string })?.error || "Failed to load application");
      }
      const typed = payload as ApplicationDetail;
      setData(typed);
      setCategoryLabel(typed.application?.shopify?.kategorieCollectionGid || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load application");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const handleStatusChange = async (status: "in_review" | "accepted" | "rejected", note: string) => {
    if (!applicationId) return;
    setActionError(null);
    setActionMessage(null);
    setActing(true);
    try {
      const res = await fetch(`/api/admin/applications/${encodeURIComponent(applicationId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() || undefined }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to update status");
      setActionMessage(`Status updated to ${status.replace(/_/g, " ")}.`);
      await load();
    } catch (err: any) {
      setActionError(err?.message || "Failed to update status");
    } finally {
      setActing(false);
    }
  };

  const handleAssignCategory = async (collection: CollectionOption | null) => {
    if (!applicationId) return;
    setCategorySaving(true);
    setCategoryMessage(null);
    setCategoryError(null);
    try {
      const res = await fetch(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopify: {
            kategorieCollectionGid: collection ? collection.id : "",
          },
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update category");
      }
      setCategoryMessage(collection ? "Category assigned." : "Category cleared.");
      setCategoryLabel(collection ? collection.title : null);
      setCategoryQuery("");
      setCategoryResults([]);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          application: {
            ...prev.application,
            shopify: {
              ...prev.application.shopify,
              kategorieCollectionGid: collection ? collection.id : undefined,
            },
          },
        };
      });
    } catch (err: any) {
      setCategoryError(err?.message || "Failed to update category");
    } finally {
      setCategorySaving(false);
    }
  };

  const application = data?.application;
  const canMoveToReview = application?.status === "submitted";
  const canDecide = application?.status === "in_review";
  const panelStyle: CSSProperties = { ["--shadow" as any]: "0 1px 2px rgba(15, 23, 42, 0.04)" };

  useEffect(() => {
    if (!application?.profileImages) {
      setProfilePreviews({});
      return;
    }
    const gids = [
      application.profileImages.titelbildGid,
      application.profileImages.bild1Gid,
      application.profileImages.bild2Gid,
      application.profileImages.bild3Gid,
    ].filter((gid): gid is string => typeof gid === "string" && gid.trim().length > 0);

    if (!gids.length) {
      setProfilePreviews({});
      return;
    }

    const missing = gids.filter((gid) => !profilePreviews[gid]);
    if (!missing.length) return;

    let active = true;
    const run = async () => {
      try {
        const res = await fetch(`/api/shopify/files/resolve?ids=${encodeURIComponent(missing.join(","))}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload) return;
        const files = Array.isArray(payload.files) ? payload.files : [];
        if (!files.length) return;
        if (!active) return;
        setProfilePreviews((prev) => {
          const next = { ...prev };
          for (const file of files) {
            if (!file?.id) continue;
            const url = file.previewImage || file.url;
            if (url) {
              next[file.id] = url;
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

  useEffect(() => {
    const query = categoryQuery.trim();
    if (!query) {
      setCategoryResults([]);
      setCategoryError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCategoryLoading(true);
      setCategoryError(null);
      try {
        const res = await fetch(`/api/shopify/collections?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { collections?: CollectionOption[]; error?: string } | null;
        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load collections");
        }
        setCategoryResults(Array.isArray(payload?.collections) ? payload.collections : []);
      } catch (err: any) {
        setCategoryError(err?.message || "Failed to load collections");
      } finally {
        setCategoryLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [categoryQuery]);

  const profileImageRows = useMemo(() => {
    const images = application?.profileImages || {};
    return [
      { label: "Titelbild", gid: images.titelbildGid },
      { label: "Bild 1", gid: images.bild1Gid },
      { label: "Bild 2", gid: images.bild2Gid },
      { label: "Bild 3", gid: images.bild3Gid },
    ];
  }, [application?.profileImages]);

  if (!applicationId) {
    return (
      <main className="p-6">
        <div className="card">
          <h1 className="text-xl font-semibold">Application not found</h1>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="card">Loading application...</div>
      </main>
    );
  }

  if (error || !application) {
    return (
      <main className="p-6">
        <div className="card text-red-600">Error: {error || "Application not found"}</div>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-4" style={panelStyle}>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Application review</h1>
          <p className="text-sm text-slate-600">Review applicant data, uploads, and decide the next step.</p>
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Status: {application.status.replace(/_/g, " ")}
        </div>
      </header>

      {actionError && <div className="card text-red-600">Action error: {actionError}</div>}
      {actionMessage && <div className="card text-emerald-700">{actionMessage}</div>}

      <div className="card space-y-4">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Actions</h2>
        </div>
        <div className="grid gap-4">
          <div className="rounded border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">Move to in review</div>
            <p className="text-xs text-slate-500">Mark the application as in review.</p>
            <textarea
              className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional review note"
              disabled={!canMoveToReview || acting}
            />
            <button
              className="btnGhost mt-3"
              onClick={() => handleStatusChange("in_review", reviewNote)}
              disabled={!canMoveToReview || acting}
            >
              {acting ? "Working..." : "Move to in review"}
            </button>
          </div>

          <div className="rounded border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">Decision</div>
            <p className="text-xs text-slate-500">Accept or reject once review is complete.</p>
            <textarea
              className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Optional decision note"
              disabled={!canDecide || acting}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btnGhost"
                onClick={() => handleStatusChange("accepted", decisionNote)}
                disabled={!canDecide || acting}
              >
                Accept
              </button>
              <button
                className="btnGhost"
                onClick={() => handleStatusChange("rejected", decisionNote)}
                disabled={!canDecide || acting}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Personal</h2>
          </div>
          <div className="text-sm text-slate-700">
            <div className="font-semibold text-slate-900">{application.personal?.fullName || "—"}</div>
            <div>{application.personal?.email || "—"}</div>
            <div>{application.personal?.phone || "—"}</div>
            <div>
              {application.personal?.city || "—"} · {application.personal?.country || "—"}
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Shopify fields</h2>
          </div>
          <div className="text-sm text-slate-700 space-y-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Instagram</div>
              <div>{application.shopify?.instagramUrl || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quote</div>
              <div>{application.shopify?.quote || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Intro</div>
              <div>{application.shopify?.einleitung_1 || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Text</div>
              <div>{application.shopify?.text_1 || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Category GID</div>
              <div className="break-all">{application.shopify?.kategorieCollectionGid || "—"}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assign category</div>
              <div className="mt-2 text-sm text-slate-700">
                {categoryLabel || application.shopify?.kategorieCollectionGid || "Unassigned"}
              </div>
              {application.shopify?.kategorieCollectionGid ? (
                <div className="mt-1 break-all text-xs text-slate-500">
                  GID: {application.shopify.kategorieCollectionGid}
                </div>
              ) : null}
              <label className="field mt-3">
                Search collections
                <input
                  type="text"
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  placeholder="Start typing a collection title"
                  disabled={categorySaving}
                />
              </label>
              {categoryLoading ? <div className="text-xs text-slate-500">Loading collections...</div> : null}
              {categoryError ? <div className="text-xs text-red-600">{categoryError}</div> : null}
              {categoryResults.length > 0 ? (
                <div className="mt-2 grid gap-2">
                  {categoryResults.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      className="btnGhost w-full"
                      onClick={() => handleAssignCategory(collection)}
                      disabled={categorySaving}
                    >
                      <span>{collection.title}</span>
                      <span className="ml-auto text-xs text-slate-500">Select</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btnGhost" onClick={() => handleAssignCategory(null)} disabled={categorySaving}>
                  Clear category
                </button>
                {categoryMessage ? <span className="text-xs text-emerald-700">{categoryMessage}</span> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Profile images</h2>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            {profileImageRows.map((row) => (
              <div key={row.label}>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{row.label}</div>
                <div className="break-all">{row.gid || "—"}</div>
                {row.gid && profilePreviews[row.gid] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePreviews[row.gid]}
                    alt={row.label}
                    className="mt-2 h-20 w-28 rounded-md object-cover"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Legal acceptance</h2>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Terms version</div>
              <div>{application.legal?.termsVersion || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Accepted at</div>
              <div>{formatDate(application.legal?.acceptedAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Accepted name</div>
              <div>{application.legal?.acceptedName || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">IP</div>
              <div>{application.legal?.acceptedIp || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">User agent</div>
              <div className="break-all">{application.legal?.acceptedUserAgent || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Audit</h2>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <div>Submitted: {formatDate(application.submittedAt)}</div>
            <div>Reviewed: {formatDate(application.reviewedAt)}</div>
            <div>Accepted: {formatDate(application.acceptedAt)}</div>
            <div>Created: {formatDate(application.createdAt)}</div>
            <div>Updated: {formatDate(application.updatedAt)}</div>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Admin notes</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-700">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reviewer note</div>
              <div>{application.admin?.reviewerNote || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Decision note</div>
              <div>{application.admin?.decisionNote || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Uploaded media</h2>
          <span className="text-xs text-slate-500">{data?.media.length || 0} files</span>
        </div>
        {data?.media.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.media.map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-white p-3">
                <div className="h-32 w-full overflow-hidden rounded-md bg-slate-100">
                  {(() => {
                    const previewSrc = item.previewUrl || item.url;
                    if (previewSrc && isImage(item.mimeType, item.filename)) {
                      // eslint-disable-next-line @next/next/no-img-element
                      return <img src={previewSrc} alt={item.filename || "Media"} className="h-full w-full object-cover" />;
                    }
                    if (previewSrc && isVideo(item.mimeType, item.filename)) {
                      return <video className="h-full w-full object-cover" src={previewSrc} controls preload="metadata" />;
                    }
                    if (isPdf(item.mimeType, item.filename)) {
                      return (
                        <div className="flex h-full w-full flex-col items-center justify-center text-xs text-slate-500">
                          <span className="text-sm font-semibold text-slate-700">PDF</span>
                          <span>{item.filename || "Document"}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                        {item.filename || "Media"}
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{item.filename || "Untitled"}</div>
                <div className="text-xs text-slate-500">{item.kind || "media"}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No uploads yet.</p>
        )}
      </div>

      <div className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Submitted artworks</h2>
          <span className="text-xs text-slate-500">{data?.artworks.length || 0} drafts</span>
        </div>
        {data?.artworks.length ? (
          <div className="space-y-3">
            {data.artworks.map((artwork) => (
              <div key={artwork.id} className="rounded border border-slate-200 bg-white p-3">
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
                    {artwork.widthCm && artwork.heightCm
                      ? `Size: ${artwork.widthCm}cm × ${artwork.heightCm}cm`
                      : ""}
                    {artwork.originalPriceEur ? ` · Original €${artwork.originalPriceEur}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No artwork drafts yet.</p>
        )}
      </div>
    </main>
  );
}
