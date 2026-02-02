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
    intents?: {
      exhibitAtEvents?: boolean;
      rentOriginals?: boolean;
      licensePrintRights?: boolean;
      presentOnly?: boolean;
      sellOriginals?: boolean;
      sellPrints?: boolean;
      notes?: string;
    };
    legal?: {
      termsDocumentKey?: string;
      termsVersionId?: string;
      termsVersionNumber?: number;
      termsEffectiveAt?: string;
      termsHash?: string;
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
    rejectedAt?: string;
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
  const [decisionNote, setDecisionNote] = useState("");
  const [profilePreviews, setProfilePreviews] = useState<Record<string, string>>({});
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryResults, setCategoryResults] = useState<CollectionOption[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [lightboxArtwork, setLightboxArtwork] = useState<ArtworkItem | null>(null);

  const load = async () => {
    if (!applicationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${encodeURIComponent(applicationId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApplicationDetail | { error?: string } | null;
      if (!res.ok || !payload || "error" in payload) {
        throw new Error((payload as { error?: string })?.error || "Failed to load registration");
      }
      const typed = payload as ApplicationDetail;
      setData(typed);
      setCategoryLabel(typed.application?.shopify?.kategorieCollectionGid || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load registration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const handleStatusChange = async (status: "accepted" | "rejected", note: string) => {
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
  const canDecide = application?.status === "submitted" || application?.status === "in_review";
  const panelStyle: CSSProperties = { ["--shadow" as any]: "0 1px 2px rgba(15, 23, 42, 0.04)" };
  const displayStatus = application?.status;
  const termsVersionLabel = application?.legal?.termsVersionNumber
    ? `v${application.legal.termsVersionNumber}`
    : application?.legal?.termsVersion || "—";
  const mediaById = useMemo(() => {
    const items = data?.media || [];
    return new Map(items.map((item) => [item.id, item]));
  }, [data?.media]);

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
        const res = await fetch(`/api/shopify/resolve-media?ids=${encodeURIComponent(missing.join(","))}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload) return;
        const files = Array.isArray(payload.items) ? payload.items : [];
        if (!files.length) return;
        if (!active) return;
        setProfilePreviews((prev) => {
          const next = { ...prev };
          for (const file of files) {
            if (!file?.id) continue;
            const url = file.url;
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
          <h1 className="text-xl font-semibold">Registration not found</h1>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="card">Loading registration...</div>
      </main>
    );
  }

  if (error || !application) {
    return (
      <main className="p-6">
        <div className="card text-red-600">Error: {error || "Registration not found"}</div>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-4" style={panelStyle}>
      <div className="card sticky top-4 z-10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Registration</div>
            <h1 className="text-2xl font-semibold text-slate-900">Registration review</h1>
            <div className="mt-1 text-sm text-slate-600">
              {application.personal?.fullName || "Unnamed registrant"} · {application.personal?.email || "No email"} ·{" "}
              {application.personal?.city || "City"} · {formatDate(application.submittedAt)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {displayStatus?.replace(/_/g, " ") || "draft"}
            </div>
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
        <div className="mt-3">
          <textarea
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
            rows={2}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="Decision note (optional)"
            disabled={!canDecide || acting}
          />
        </div>
      </div>

      {actionError && <div className="card text-red-600">Action error: {actionError}</div>}
      {actionMessage && <div className="card text-emerald-700">{actionMessage}</div>}

      <div className="card space-y-3">
        <div className="cardHeader">
          <h2 className="text-lg font-semibold">Intent & preferences</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "exhibitAtEvents", label: "Exhibit at events" },
            { key: "sellOriginals", label: "Sell originals" },
            { key: "sellPrints", label: "Sell prints" },
            { key: "licensePrintRights", label: "License print rights" },
            { key: "rentOriginals", label: "Rent originals" },
            { key: "presentOnly", label: "Present only" },
          ].map((item) => {
            const value = Boolean((application.intents as Record<string, boolean | undefined> | undefined)?.[item.key]);
            return (
              <span
                key={item.key}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  value ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {item.label}: {value ? "Enabled" : "Disabled"}
              </span>
            );
          })}
        </div>
        {application.intents?.notes ? (
          <div className="text-sm text-slate-700">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Notes</div>
            <div className="mt-1 whitespace-pre-wrap">{application.intents.notes}</div>
          </div>
        ) : (
          <div className="text-xs text-slate-500">No notes provided.</div>
        )}
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
          <div className="grid gap-3 sm:grid-cols-2">
            {profileImageRows.map((row) => {
              const previewUrl = row.gid ? profilePreviews[row.gid] : null;
              return (
                <div key={row.label} className="rounded border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{row.label}</div>
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={row.label} className="mt-2 h-28 w-full rounded-md object-cover" />
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">No image uploaded</div>
                  )}
                </div>
              );
            })}
          </div>
          <details className="mt-2 rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Advanced GIDs
            </summary>
            <div className="mt-2 space-y-1 break-all">
              {profileImageRows.map((row) => (
                <div key={row.label}>
                  {row.label}: {row.gid || "—"}
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="card space-y-3">
          <div className="cardHeader">
            <h2 className="text-lg font-semibold">Legal acceptance</h2>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Terms version</div>
              <div>{termsVersionLabel}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Terms effective</div>
              <div>{formatDate(application.legal?.termsEffectiveAt)}</div>
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
            <div>Rejected: {formatDate(application.rejectedAt)}</div>
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {data.media.map((item) => (
              <div key={item.id} className="rounded border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  className="h-32 w-full overflow-hidden rounded-md bg-slate-100"
                  onClick={() => setLightboxMedia(item)}
                >
                  {(() => {
                    const previewSrc = item.previewUrl || item.url;
                    if (previewSrc && isImage(item.mimeType, item.filename)) {
                      // eslint-disable-next-line @next/next/no-img-element
                      return <img src={previewSrc} alt={item.filename || "Media"} className="h-full w-full object-cover" />;
                    }
                    if (previewSrc && isVideo(item.mimeType, item.filename)) {
                      return <video className="h-full w-full object-cover" src={previewSrc} muted />;
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
                </button>
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
          <div className="grid gap-2">
            {data.artworks.map((artwork) => (
              <button
                key={artwork.id}
                type="button"
                className="rounded border border-slate-200 bg-white px-4 py-3 text-left"
                onClick={() => setLightboxArtwork(artwork)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{artwork.title}</div>
                    <div className="text-xs text-slate-500">
                      {formatOffering(artwork.offering)} | {artwork.mediaIds.length} image(s)
                    </div>
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {artwork.status || "draft"}
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {artwork.widthCm && artwork.heightCm ? `Size: ${artwork.widthCm}cm x ${artwork.heightCm}cm` : "Size: —"}
                  {artwork.originalPriceEur ? ` | Original €${artwork.originalPriceEur}` : ""}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No artwork drafts yet.</p>
        )}
      </div>

      {lightboxMedia ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setLightboxMedia(null)}>
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{lightboxMedia.filename || "Media"}</div>
                <div className="text-xs text-slate-500">{lightboxMedia.mimeType || "File"}</div>
              </div>
              <button type="button" className="btnGhost" onClick={() => setLightboxMedia(null)}>
                Close
              </button>
            </div>
            <div className="mt-3">
              {(() => {
                const previewSrc = lightboxMedia.previewUrl || lightboxMedia.url;
                if (previewSrc && isImage(lightboxMedia.mimeType, lightboxMedia.filename)) {
                  // eslint-disable-next-line @next/next/no-img-element
                  return <img src={previewSrc} alt={lightboxMedia.filename || "Preview"} className="max-h-[70vh] w-full object-contain" />;
                }
                if (previewSrc && isVideo(lightboxMedia.mimeType, lightboxMedia.filename)) {
                  return <video src={previewSrc} controls className="max-h-[70vh] w-full object-contain" />;
                }
                if (previewSrc && isPdf(lightboxMedia.mimeType, lightboxMedia.filename)) {
                  return (
                    <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                      <div className="font-semibold">PDF</div>
                      <a href={previewSrc} target="_blank" rel="noreferrer" className="text-xs underline">
                        Open / Download
                      </a>
                    </div>
                  );
                }
                return <div className="text-sm text-slate-600">Preview not available.</div>;
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {lightboxArtwork ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setLightboxArtwork(null)}>
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{lightboxArtwork.title}</div>
                <div className="text-xs text-slate-500">{formatOffering(lightboxArtwork.offering)}</div>
              </div>
              <button type="button" className="btnGhost" onClick={() => setLightboxArtwork(null)}>
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {lightboxArtwork.mediaIds.map((id) => {
                const item = mediaById.get(id);
                if (!item) return null;
                const previewSrc = item.previewUrl || item.url;
                if (previewSrc && isImage(item.mimeType, item.filename)) {
                  // eslint-disable-next-line @next/next/no-img-element
                  return <img key={id} src={previewSrc} alt={item.filename || "Artwork"} className="h-40 w-full rounded-md object-cover" />;
                }
                if (previewSrc && isVideo(item.mimeType, item.filename)) {
                  return <video key={id} src={previewSrc} className="h-40 w-full rounded-md object-cover" muted />;
                }
                return (
                  <div key={id} className="flex h-40 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-500">
                    {item.filename || "File"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
