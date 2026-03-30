"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { renderMarkdownToHtml } from "@/lib/markdown";

type TermsModule = {
  documentSlug: string;
  title: string;
  versionId: string;
  version: number;
  bodyMarkdown: string;
  effectiveAt?: string | null;
};

type TermsAcceptedRecord = {
  id: string;
  documentSlug: string;
  version: number;
  versionId?: string | null;
  acceptedAt?: string | null;
  acceptedName?: string;
  snapshotHash: string;
};

type OnboardingResponse = {
  ok: boolean;
  onboardingComplete: boolean;
  artistKey: string;
  personal: { fullName: string; email: string };
  shopify: { handle: string; displayName: string; instagram: string };
  profileImages: { avatarUrl: string; heroUrl: string; galleryUrls: string[] };
  consents: {
    sellOriginals: boolean;
    sellPrints: boolean;
    rental: boolean;
    exhibitions: boolean;
    presentationOnly: boolean;
  };
  terms: { activeModules: TermsModule[]; accepted: TermsAcceptedRecord[] };
};

const steps = ["Personal", "Shopify profile", "Profile images", "Consents", "Terms"];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ArtistsOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "hero" | "gallery" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [artistKey, setArtistKey] = useState("");
  const [step, setStep] = useState(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [instagram, setInstagram] = useState("");

  const [avatarUrl, setAvatarUrl] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);

  const [sellOriginals, setSellOriginals] = useState(false);
  const [sellPrints, setSellPrints] = useState(false);
  const [rental, setRental] = useState(false);
  const [exhibitions, setExhibitions] = useState(false);
  const [presentationOnly, setPresentationOnly] = useState(false);

  const [termsModules, setTermsModules] = useState<TermsModule[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState<TermsAcceptedRecord[]>([]);
  const [termsChecked, setTermsChecked] = useState<Record<string, boolean>>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptedName, setAcceptedName] = useState("");

  const progress = ((step + 1) / steps.length) * 100;

  const termsHtml = useMemo(
    () =>
      termsModules.reduce<Record<string, string>>((acc, item) => {
        acc[item.documentSlug] = renderMarkdownToHtml(item.bodyMarkdown || "");
        return acc;
      }, {}),
    [termsModules],
  );

  const resolveUploadedFileUrl = async (fileIdGid: string) => {
    const encoded = encodeURIComponent(fileIdGid);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await fetch(`/api/shopify/files/resolve?ids=${encoded}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { files?: Array<{ id?: string; url?: string | null; previewImage?: string | null }> }
        | null;
      if (res.ok) {
        const file = payload?.files?.[0];
        const url = file?.url || file?.previewImage || "";
        if (url) return url;
      }
      if (attempt < 5) await wait(600);
    }
    return "";
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artists/v2/onboarding", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as OnboardingResponse | { error?: string } | null;
      if (res.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent("/artists/onboarding")}`);
        return;
      }
      if (!res.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "Failed to load onboarding");
      }

      const data = payload as OnboardingResponse;
      setOnboardingComplete(data.onboardingComplete === true);
      setArtistKey(data.artistKey || "");
      setFullName(data.personal.fullName || "");
      setEmail(data.personal.email || "");
      setHandle(data.shopify.handle || "");
      setDisplayName(data.shopify.displayName || "");
      setInstagram(data.shopify.instagram || "");
      setAvatarUrl(data.profileImages.avatarUrl || "");
      setHeroUrl(data.profileImages.heroUrl || "");
      setGalleryUrls(Array.isArray(data.profileImages.galleryUrls) ? data.profileImages.galleryUrls : []);
      setSellOriginals(data.consents.sellOriginals === true);
      setSellPrints(data.consents.sellPrints === true);
      setRental(data.consents.rental === true);
      setExhibitions(data.consents.exhibitions === true);
      setPresentationOnly(data.consents.presentationOnly === true);
      setTermsModules(Array.isArray(data.terms.activeModules) ? data.terms.activeModules : []);
      setAcceptedTerms(Array.isArray(data.terms.accepted) ? data.terms.accepted : []);

      const nextChecked: Record<string, boolean> = {};
      for (const item of data.terms.activeModules || []) {
        const alreadyAccepted = (data.terms.accepted || []).some(
          (entry) => entry.documentSlug === item.documentSlug && entry.version === item.version,
        );
        nextChecked[item.documentSlug] = alreadyAccepted;
      }
      setTermsChecked(nextChecked);
      setAcceptTerms(Object.values(nextChecked).length > 0 && Object.values(nextChecked).every(Boolean));
    } catch (err: any) {
      setError(err?.message || "Failed to load onboarding");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (!fullName.trim() || fullName.trim().length < 2) return "Please enter your full name.";
      return null;
    }
    if (index === 1) {
      if (!handle.trim() || handle.trim().length < 2) return "Handle is required.";
      if (!displayName.trim() || displayName.trim().length < 2) return "Display name is required.";
      return null;
    }
    if (index === 2) {
      if (!avatarUrl.trim() && !heroUrl.trim() && galleryUrls.length === 0) {
        return "Please upload at least one profile image.";
      }
      return null;
    }
    if (index === 3) {
      return null;
    }
    if (index === 4) {
      if (!acceptTerms) return "Please accept the terms.";
      for (const module of termsModules) {
        if (!termsChecked[module.documentSlug]) {
          return `Please accept ${module.title}.`;
        }
      }
      if (!acceptedName.trim() || acceptedName.trim().length < 2) return "Please type your name for acceptance.";
    }
    return null;
  };

  const handleUpload = async (file: File, kind: "avatar" | "hero" | "gallery") => {
    setError(null);
    setUploading(kind);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/shopify/files/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; url?: string | null; fileIdGid?: string }
        | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Upload failed");
      }

      let resolvedUrl = payload?.url || "";
      if (!resolvedUrl && payload?.fileIdGid) {
        resolvedUrl = await resolveUploadedFileUrl(payload.fileIdGid);
      }
      if (!resolvedUrl) {
        throw new Error("Upload finished, but preview is not ready yet. Please try again in a few seconds.");
      }

      if (kind === "avatar") {
        setAvatarUrl(resolvedUrl);
      } else if (kind === "hero") {
        setHeroUrl(resolvedUrl);
      } else {
        setGalleryUrls((prev) => Array.from(new Set([...prev, resolvedUrl])).slice(0, 10));
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const onSubmit = async () => {
    const stepError = validateStep(4);
    if (stepError) {
      setError(stepError);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const acceptedDocumentSlugs = termsModules.filter((item) => termsChecked[item.documentSlug]).map((item) => item.documentSlug);

      const res = await fetch("/api/artists/v2/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personal: { fullName },
          shopify: { handle, displayName, instagram },
          profileImages: { avatarUrl, heroUrl, galleryUrls },
          consents: { sellOriginals, sellPrints, rental, exhibitions, presentationOnly },
          terms: {
            acceptedDocumentSlugs,
            acceptedName,
            accepted: acceptTerms,
          },
        }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to submit onboarding");
      }

      setOnboardingComplete(true);
      setMessage("Onboarding saved.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to submit onboarding");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ac-shell">
        <div className="ac-card" style={{ maxWidth: 920, margin: "40px auto" }}>
          Loading onboarding...
        </div>
      </div>
    );
  }

  return (
    <div className="ac-shell">
      <div className="ac-card" style={{ maxWidth: 920, margin: "40px auto" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Artist onboarding</h1>
            <p className="mt-1 text-sm text-slate-600">
              Artist key: {artistKey || "—"}
              {onboardingComplete ? " · completed" : " · pending"}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs text-slate-500">
            Step {step + 1} / {steps.length}: {steps[step]}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${progress}%`, background: "#0f172a" }} />
          </div>
        </div>

        {error ? <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

        <div className="mt-6 space-y-4">
          {step === 0 ? (
            <div className="grid gap-3">
              <label className="field">
                Full name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
              </label>
              <label className="field">
                Email (locked)
                <input value={email} readOnly />
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3">
              <label className="field">
                Handle
                <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="artist-handle" />
              </label>
              <label className="field">
                Display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Displayed publicly" />
              </label>
              <label className="field">
                Instagram
                <input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@handle or URL" />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-slate-200 p-3">
                  <div className="mb-2 text-sm font-semibold">Avatar</div>
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Avatar preview" className="h-28 w-28 rounded object-cover" />
                  ) : (
                    <div className="text-xs text-slate-500">No avatar uploaded.</div>
                  )}
                  <label className="btnGhost mt-3 inline-flex cursor-pointer">
                    {uploading === "avatar" ? "Uploading..." : "Upload avatar"}
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      disabled={uploading !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUpload(file, "avatar");
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>

                <div className="rounded border border-slate-200 p-3">
                  <div className="mb-2 text-sm font-semibold">Hero</div>
                  {heroUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={heroUrl} alt="Hero preview" className="h-28 w-full rounded object-cover" />
                  ) : (
                    <div className="text-xs text-slate-500">No hero image uploaded.</div>
                  )}
                  <label className="btnGhost mt-3 inline-flex cursor-pointer">
                    {uploading === "hero" ? "Uploading..." : "Upload hero"}
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      disabled={uploading !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUpload(file, "hero");
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded border border-slate-200 p-3">
                <div className="mb-2 text-sm font-semibold">Gallery</div>
                {galleryUrls.length === 0 ? <div className="text-xs text-slate-500">No gallery images uploaded.</div> : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  {galleryUrls.map((url) => (
                    <div key={url} className="relative rounded border border-slate-200 p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Gallery preview" className="h-28 w-full rounded object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-xs"
                        onClick={() => setGalleryUrls((prev) => prev.filter((item) => item !== url))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <label className="btnGhost mt-3 inline-flex cursor-pointer">
                  {uploading === "gallery" ? "Uploading..." : "Add gallery image"}
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    disabled={uploading !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file, "gallery");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-2 text-sm text-slate-700">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={sellOriginals} onChange={(event) => setSellOriginals(event.target.checked)} />
                Sell originals
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={sellPrints} onChange={(event) => setSellPrints(event.target.checked)} />
                Sell prints
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={rental} onChange={(event) => setRental(event.target.checked)} />
                Rental
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={exhibitions} onChange={(event) => setExhibitions(event.target.checked)} />
                Exhibitions
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={presentationOnly}
                  onChange={(event) => setPresentationOnly(event.target.checked)}
                />
                Presentation-only
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              {termsModules.map((module) => (
                <div key={`${module.documentSlug}:${module.version}`} className="rounded border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{module.title}</div>
                      <div className="text-xs text-slate-500">
                        {module.documentSlug} · v{module.version} · Effective {formatDate(module.effectiveAt)}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={Boolean(termsChecked[module.documentSlug])}
                        onChange={(event) =>
                          setTermsChecked((prev) => ({
                            ...prev,
                            [module.documentSlug]: event.target.checked,
                          }))
                        }
                      />
                      Accept this module
                    </label>
                  </div>

                  {termsHtml[module.documentSlug] ? (
                    <div className="md-preview mt-3" dangerouslySetInnerHTML={{ __html: termsHtml[module.documentSlug] }} />
                  ) : (
                    <div className="mt-2 text-xs text-slate-500">No terms body found.</div>
                  )}
                </div>
              ))}

              <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
                <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} />
                I accept all modules above.
              </label>

              <label className="field">
                Typed name for acceptance
                <input
                  value={acceptedName}
                  onChange={(event) => setAcceptedName(event.target.value)}
                  placeholder="Type your full name"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btnGhost" disabled={step === 0 || saving} onClick={() => setStep((prev) => Math.max(0, prev - 1))}>
            Back
          </button>

          {step < steps.length - 1 ? (
            <button
              type="button"
              className="btnPrimary"
              disabled={saving}
              onClick={() => {
                const stepError = validateStep(step);
                if (stepError) {
                  setError(stepError);
                  return;
                }
                setError(null);
                setStep((prev) => Math.min(steps.length - 1, prev + 1));
              }}
            >
              Next
            </button>
          ) : (
            <button type="button" className="btnPrimary" disabled={saving} onClick={onSubmit}>
              {saving ? "Submitting..." : onboardingComplete ? "Save changes" : "Submit onboarding"}
            </button>
          )}
        </div>

        <div className="mt-8 rounded border border-slate-200 p-3">
          <div className="text-sm font-semibold text-slate-900">Accepted terms history</div>
          {acceptedTerms.length === 0 ? <div className="mt-2 text-xs text-slate-500">No acceptance records yet.</div> : null}
          {acceptedTerms.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {acceptedTerms.map((item) => (
                <li key={item.id} className="rounded bg-slate-50 p-2 text-xs text-slate-700">
                  {item.documentSlug} · v{item.version} · {formatDate(item.acceptedAt)} · {item.acceptedName || "—"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
