"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";

import { calculatePrintPriceCents } from "@/lib/artistPrintPricing";

type ConsentState = {
  allowOriginalSales: boolean;
  allowPrintSales: boolean;
  allowRental: boolean;
  allowExhibitions: boolean;
  presentationOnly: boolean;
};

type ArtistProfile = {
  artistKey: string;
  onboardingComplete: boolean;
  email: string;
  handle: string;
  displayName: string;
  instagram: string;
  profileImages: {
    avatarUrl: string;
    heroUrl: string;
    galleryUrls: string[];
  };
  consents: ConsentState;
};

type PrintSize = {
  code: string;
  label: string;
  widthCm: number;
  heightCm: number;
};

type ArtworkVariant = {
  id: string;
  variantKey: string;
  finish: string;
  sizeCode: string;
  sku: string;
  priceCents: number;
};

type ArtworkItem = {
  id: string;
  productKey: string;
  title: string;
  year: number | null;
  shortText: string;
  offerings: "original_only" | "prints_only" | "original_plus_prints";
  status: string;
  createdAt?: string;
  updatedAt?: string;
  dimensions: {
    widthCm: number | null;
    heightCm: number | null;
  };
  images: {
    thumbUrl: string;
    mediumUrl: string;
    originalUrl: string;
    galleryUrls: string[];
  };
  variants: ArtworkVariant[];
};

type MediaItem = {
  id: string;
  kind: "artwork" | "gallery" | "avatar" | "hero" | "other";
  fileIdGid: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number | null;
  url: string;
  previewUrl: string;
  createdAt?: string;
};

type DashboardResponse = {
  ok: boolean;
  artist: ArtistProfile;
  printSizes: PrintSize[];
  artworks: ArtworkItem[];
};

const kindOptions: Array<{ value: MediaItem["kind"]; label: string }> = [
  { value: "artwork", label: "Artwork" },
  { value: "gallery", label: "Gallery" },
  { value: "avatar", label: "Avatar" },
  { value: "hero", label: "Hero" },
  { value: "other", label: "Other" },
];

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
}

function toIsoDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function ArtistsDashboardPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "guest" | "artist">("checking");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [consents, setConsents] = useState<ConsentState>({
    allowOriginalSales: false,
    allowPrintSales: false,
    allowRental: false,
    allowExhibitions: false,
    presentationOnly: false,
  });
  const [printSizes, setPrintSizes] = useState<PrintSize[]>([]);
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);

  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadKind, setUploadKind] = useState<MediaItem["kind"]>("artwork");
  const [uploading, setUploading] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [creatingArtwork, setCreatingArtwork] = useState(false);

  const [createTitle, setCreateTitle] = useState("");
  const [createYear, setCreateYear] = useState("");
  const [createWidthCm, setCreateWidthCm] = useState("");
  const [createHeightCm, setCreateHeightCm] = useState("");
  const [createShortText, setCreateShortText] = useState("");
  const [createOfferings, setCreateOfferings] = useState<ArtworkItem["offerings"]>("prints_only");
  const [createOriginalPriceEur, setCreateOriginalPriceEur] = useState("");
  const [createPrintSizes, setCreatePrintSizes] = useState<string[]>([]);
  const [createMediaIds, setCreateMediaIds] = useState<string[]>([]);

  const loadDashboard = async () => {
    const res = await fetch("/api/artists/v2/dashboard", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as DashboardResponse | { error?: string } | null;

    if (res.status === 401) {
      setAuthState("guest");
      return null;
    }
    if (!res.ok) {
      throw new Error((payload as { error?: string } | null)?.error || "Failed to load dashboard");
    }
    const data = payload as DashboardResponse;
    setArtist(data.artist);
    setConsents(data.artist.consents);
    setPrintSizes(Array.isArray(data.printSizes) ? data.printSizes : []);
    setArtworks(Array.isArray(data.artworks) ? data.artworks : []);
    return data;
  };

  const loadMedia = async () => {
    const res = await fetch("/api/artists/v2/media", { cache: "no-store" });
    const payload = (await res.json().catch(() => null)) as { ok?: boolean; media?: MediaItem[]; error?: string } | null;
    if (res.status === 401) {
      setAuthState("guest");
      return;
    }
    if (!res.ok) {
      throw new Error(payload?.error || "Failed to load media");
    }
    setMedia(Array.isArray(payload?.media) ? payload.media : []);
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboardData = await loadDashboard();
      if (!dashboardData) return;
      if (dashboardData.artist?.onboardingComplete !== true) {
        router.replace("/artists/onboarding");
        return;
      }
      await loadMedia();
    } catch (err: any) {
      setError(err?.message || "Failed to load artist dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const session = await getSession();
        if (!active) return;

        if (!session?.user) {
          setAuthState("guest");
          setLoading(false);
          return;
        }

        if (session.user.role === "team") {
          router.replace("/admin");
          return;
        }

        if (session.user.role === "customer") {
          router.replace("/account");
          return;
        }

        setAuthState("artist");
      } catch {
        if (!active) return;
        setAuthState("guest");
        setLoading(false);
      }
    };
    void checkAuth();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (authState !== "artist") return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState]);

  const selectableMedia = useMemo(() => media, [media]);
  const selectedPrintSizes = useMemo(
    () => printSizes.filter((item) => createPrintSizes.includes(item.code)),
    [createPrintSizes, printSizes],
  );
  const includePrints = createOfferings === "prints_only" || createOfferings === "original_plus_prints";

  const estimatedPrintPrices = useMemo(() => {
    const originalPriceCents = createOriginalPriceEur.trim() ? Math.round(Number(createOriginalPriceEur) * 100) : undefined;
    return selectedPrintSizes.map((size) => ({
      code: size.code,
      label: size.label,
      priceCents: calculatePrintPriceCents({
        widthCm: size.widthCm,
        heightCm: size.heightCm,
        originalPriceCents: Number.isFinite(originalPriceCents) ? originalPriceCents : undefined,
      }),
    }));
  }, [createOriginalPriceEur, selectedPrintSizes]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artists/v2/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consents),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save settings");
      }
      setMessage("Settings updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = "";
    if (!files.length) return;

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/artists/v2/media/upload", {
          method: "POST",
          body: formData,
        });
        const uploadPayload = (await uploadRes.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              file?: { filename?: string; mimeType?: string; sizeBytes?: number; url?: string | null; previewUrl?: string | null };
            }
          | null;
        if (!uploadRes.ok) {
          throw new Error(uploadPayload?.error || "File upload failed");
        }
        if (!uploadPayload) {
          throw new Error("File upload failed");
        }

        const resolvedUrl = uploadPayload.file?.url || "";
        const resolvedPreviewUrl = uploadPayload.file?.previewUrl || resolvedUrl;
        if (!resolvedUrl || !resolvedPreviewUrl) {
          throw new Error("File upload failed");
        }

        const saveRes = await fetch("/api/artists/v2/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: uploadKind,
            url: resolvedUrl,
            previewUrl: resolvedPreviewUrl,
            filename: uploadPayload.file?.filename || file.name,
            mimeType: uploadPayload.file?.mimeType || file.type || undefined,
            sizeBytes: uploadPayload.file?.sizeBytes ?? file.size ?? undefined,
          }),
        });
        const savePayload = (await saveRes.json().catch(() => null)) as { error?: string } | null;
        if (!saveRes.ok) {
          throw new Error(savePayload?.error || "Failed to save media");
        }
      }
      await loadMedia();
      setMessage("Media uploaded.");
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (id: string) => {
    setDeletingMediaId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/artists/v2/media/${id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to delete media");
      setCreateMediaIds((prev) => prev.filter((mediaId) => mediaId !== id));
      await loadMedia();
      setMessage("Media removed.");
    } catch (err: any) {
      setError(err?.message || "Failed to delete media");
    } finally {
      setDeletingMediaId(null);
    }
  };

  const resetArtworkForm = () => {
    setCreateTitle("");
    setCreateYear("");
    setCreateWidthCm("");
    setCreateHeightCm("");
    setCreateShortText("");
    setCreateOfferings("prints_only");
    setCreateOriginalPriceEur("");
    setCreatePrintSizes([]);
    setCreateMediaIds([]);
  };

  const handleCreateArtwork = async () => {
    setError(null);
    setMessage(null);

    if (!createTitle.trim()) {
      setError("Title is required.");
      return;
    }
    if (!createMediaIds.length) {
      setError("Select at least one uploaded image.");
      return;
    }
    if (includePrints && createPrintSizes.length === 0) {
      setError("Select at least one print size.");
      return;
    }

    setCreatingArtwork(true);
    try {
      const year = createYear.trim() ? Number(createYear) : undefined;
      const widthCm = createWidthCm.trim() ? Number(createWidthCm) : undefined;
      const heightCm = createHeightCm.trim() ? Number(createHeightCm) : undefined;
      const originalPriceEur = createOriginalPriceEur.trim() ? Number(createOriginalPriceEur) : undefined;

      const res = await fetch("/api/artists/v2/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle.trim(),
          year: Number.isFinite(year) ? year : undefined,
          dimensions: {
            widthCm: Number.isFinite(widthCm) ? widthCm : undefined,
            heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
          },
          shortText: createShortText.trim(),
          offerings: createOfferings,
          originalPriceEur: Number.isFinite(originalPriceEur) ? originalPriceEur : undefined,
          printSizeCodes: includePrints ? createPrintSizes : [],
          mediaIds: createMediaIds,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to create artwork");
      }

      await loadDashboard();
      setMessage("Artwork saved as canonical draft (db_only).");
      resetArtworkForm();
    } catch (err: any) {
      setError(err?.message || "Failed to create artwork");
    } finally {
      setCreatingArtwork(false);
    }
  };

  if (authState === "checking" || (authState === "artist" && loading)) {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 1100, margin: "40px auto" }}>
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (authState === "guest") {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 720, margin: "40px auto" }}>
          <h1 className="text-2xl font-semibold text-slate-900">Artist v2</h1>
          <p className="mt-2 text-sm text-slate-600">
            Register with your one-time key or log in if you already have an artist account.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/artists/register" className="btnPrimary">
              Register
            </Link>
            <Link href="/artists/login" className="btnGhost">
              Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-shell">
      <div className="ac-card space-y-8" style={{ maxWidth: 1100, margin: "40px auto" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Artist dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">
              {artist?.displayName || "Artist"} · {artist?.artistKey || "—"}
            </p>
          </div>
          <button type="button" className="btnGhost" onClick={() => void loadAll()} disabled={loading}>
            Refresh
          </button>
        </div>

        {error ? <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Profile preview</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-slate-200 p-3">
              <div className="text-sm font-medium text-slate-800">Header</div>
              {artist?.profileImages.heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artist.profileImages.heroUrl} alt="Hero" className="mt-2 h-36 w-full rounded object-cover" />
              ) : (
                <div className="mt-2 rounded bg-slate-50 p-3 text-xs text-slate-500">No hero image</div>
              )}
              <div className="mt-3 flex items-center gap-3">
                {artist?.profileImages.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artist.profileImages.avatarUrl} alt="Avatar" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">No avatar</div>
                )}
                <div>
                  <div className="text-sm font-semibold text-slate-900">{artist?.displayName || "—"}</div>
                  <div className="text-xs text-slate-500">@{artist?.handle || "—"}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">{artist?.instagram || "No Instagram set"}</div>
            </div>

            <div className="rounded border border-slate-200 p-3">
              <div className="text-sm font-medium text-slate-800">Gallery</div>
              {artist?.profileImages.galleryUrls?.length ? (
                <div className="mt-2 grid gap-2 grid-cols-3">
                  {artist.profileImages.galleryUrls.map((url) => (
                    <div key={url} className="overflow-hidden rounded border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Gallery" className="h-20 w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded bg-slate-50 p-3 text-xs text-slate-500">No gallery images</div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
          <div className="rounded border border-slate-200 p-3">
            <div className="grid gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowOriginalSales}
                  onChange={(event) => setConsents((prev) => ({ ...prev, allowOriginalSales: event.target.checked }))}
                />
                Sell originals
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowPrintSales}
                  onChange={(event) => setConsents((prev) => ({ ...prev, allowPrintSales: event.target.checked }))}
                />
                Sell prints
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowRental}
                  onChange={(event) => setConsents((prev) => ({ ...prev, allowRental: event.target.checked }))}
                />
                Rental
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowExhibitions}
                  onChange={(event) => setConsents((prev) => ({ ...prev, allowExhibitions: event.target.checked }))}
                />
                Exhibitions
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.presentationOnly}
                  onChange={(event) => setConsents((prev) => ({ ...prev, presentationOnly: event.target.checked }))}
                />
                Presentation-only
              </label>
            </div>
            <div className="mt-4">
              <button type="button" className="btnPrimary" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save settings"}
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Media</h2>
          <div className="rounded border border-slate-200 p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <label className="field">
                Upload kind
                <select value={uploadKind} onChange={(event) => setUploadKind(event.target.value as MediaItem["kind"])}>
                  {kindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="btnGhost inline-flex cursor-pointer items-center justify-center self-end">
                {uploading ? "Uploading..." : "Upload image(s)"}
                <input className="hidden" type="file" accept="image/*" multiple disabled={uploading} onChange={handleUpload} />
              </label>
            </div>

            {media.length === 0 ? <div className="text-sm text-slate-500">No uploaded media yet.</div> : null}
            {media.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {media.map((item) => (
                  <div key={item.id} className="rounded border border-slate-200 p-2 text-xs text-slate-600">
                    <div className="relative mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.previewUrl || item.url} alt={item.filename || "media"} className="h-28 w-full rounded object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-white/90 px-2 py-1 text-[11px]"
                        onClick={() => void handleDeleteMedia(item.id)}
                        disabled={deletingMediaId === item.id}
                      >
                        {deletingMediaId === item.id ? "..." : "Delete"}
                      </button>
                    </div>
                    <div className="font-semibold text-slate-800">{item.filename || "Untitled"}</div>
                    <div>{item.kind}</div>
                    <div>{toIsoDate(item.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Artworks</h2>

          <div className="rounded border border-slate-200 p-3 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Create artwork</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Title
                <input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Artwork title" />
              </label>
              <label className="field">
                Year
                <input value={createYear} onChange={(event) => setCreateYear(event.target.value)} type="number" placeholder="2026" />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Width (cm)
                <input
                  value={createWidthCm}
                  onChange={(event) => setCreateWidthCm(event.target.value)}
                  type="number"
                  placeholder="80"
                />
              </label>
              <label className="field">
                Height (cm)
                <input
                  value={createHeightCm}
                  onChange={(event) => setCreateHeightCm(event.target.value)}
                  type="number"
                  placeholder="120"
                />
              </label>
            </div>

            <label className="field">
              Short text
              <textarea
                value={createShortText}
                onChange={(event) => setCreateShortText(event.target.value)}
                rows={3}
                placeholder="Short description"
              />
            </label>

            <label className="field">
              Offerings
              <select
                value={createOfferings}
                onChange={(event) => setCreateOfferings(event.target.value as ArtworkItem["offerings"])}
              >
                <option value="prints_only">Prints only</option>
                <option value="original_only">Original only</option>
                <option value="original_plus_prints">Original + prints</option>
              </select>
            </label>

            {(createOfferings === "original_only" || createOfferings === "original_plus_prints") ? (
              <label className="field">
                Original price (EUR, optional)
                <input
                  value={createOriginalPriceEur}
                  onChange={(event) => setCreateOriginalPriceEur(event.target.value)}
                  type="number"
                  placeholder="1200"
                />
              </label>
            ) : null}

            {includePrints ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Print sizes</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {printSizes.map((size) => {
                    const checked = createPrintSizes.includes(size.code);
                    return (
                      <label key={size.code} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setCreatePrintSizes((prev) =>
                              event.target.checked ? Array.from(new Set([...prev, size.code])) : prev.filter((item) => item !== size.code),
                            );
                          }}
                        />
                        <span>{size.label}</span>
                      </label>
                    );
                  })}
                </div>
                {estimatedPrintPrices.length > 0 ? (
                  <div className="rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {estimatedPrintPrices.map((item) => (
                      <div key={item.code}>
                        {item.label}: {formatCurrencyFromCents(item.priceCents)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-800">Choose uploaded images</div>
              {selectableMedia.length === 0 ? <div className="text-sm text-slate-500">Upload media first.</div> : null}
              {selectableMedia.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {selectableMedia.map((item) => {
                    const selected = createMediaIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="rounded border border-slate-200 p-2 text-left"
                        style={{ outline: selected ? "2px solid #0f172a" : "none" }}
                        onClick={() =>
                          setCreateMediaIds((prev) =>
                            prev.includes(item.id) ? prev.filter((value) => value !== item.id) : [...prev, item.id],
                          )
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.previewUrl || item.url} alt={item.filename || "media"} className="h-24 w-full rounded object-cover" />
                        <div className="mt-1 text-xs font-semibold text-slate-700">{item.filename || item.id}</div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div>
              <button type="button" className="btnPrimary" onClick={handleCreateArtwork} disabled={creatingArtwork}>
                {creatingArtwork ? "Saving..." : "Save canonical artwork"}
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-200 p-3">
            <div className="mb-3 text-sm font-semibold text-slate-900">Artwork drafts</div>
            {artworks.length === 0 ? <div className="text-sm text-slate-500">No artworks yet.</div> : null}
            {artworks.length > 0 ? (
              <div className="space-y-3">
                {artworks.map((item) => (
                  <div key={item.id} className="rounded border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {item.title} {item.year ? `(${item.year})` : ""}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.offerings} · {item.status} · {item.productKey}
                        </div>
                        <div className="text-xs text-slate-500">{toIsoDate(item.createdAt)}</div>
                      </div>
                      {item.images.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.images.thumbUrl} alt={item.title} className="h-14 w-14 rounded object-cover" />
                      ) : null}
                    </div>

                    {item.shortText ? <p className="mt-2 text-sm text-slate-700">{item.shortText}</p> : null}

                    <div className="mt-2 grid gap-1 text-xs text-slate-700">
                      {item.variants.map((variant) => (
                        <div key={variant.id}>
                          {variant.finish}/{variant.sizeCode} · {formatCurrencyFromCents(variant.priceCents)} · {variant.sku}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
