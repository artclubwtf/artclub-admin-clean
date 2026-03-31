"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { renderMarkdownToHtml } from "@/lib/markdown";
import styles from "./onboarding.module.css";

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
  personal: { fullName: string; email: string; city?: string; country?: string; bio?: string };
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

const steps = [
  { label: "Personal", sub: "Basic info" },
  { label: "Visuals", sub: "Profile images" },
  { label: "Consents", sub: "Permissions" },
  { label: "Legal", sub: "Terms" },
  { label: "Finish", sub: "Review" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
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

  const termsHtml = useMemo(
    () =>
      termsModules.reduce<Record<string, string>>((acc, item) => {
        acc[item.documentSlug] = renderMarkdownToHtml(item.bodyMarkdown || "");
        return acc;
      }, {}),
    [termsModules],
  );

  const resolvedDisplayName = useMemo(() => {
    const candidate = displayName.trim().length > 0 ? displayName.trim() : fullName.trim();
    if (candidate.length > 0) return candidate;
    const localPart = email.split("@")[0] || "artist";
    return localPart;
  }, [displayName, fullName, email]);

  const resolvedHandle = useMemo(() => {
    if (handle.trim().length > 0) return handle.trim();
    const fromName = slugify(resolvedDisplayName);
    if (fromName.length > 0) return fromName;
    const localPart = slugify(email.split("@")[0] || "artist");
    return localPart || "artist";
  }, [handle, resolvedDisplayName, email]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artists/v2/onboarding", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as OnboardingResponse | { error?: string } | null;
      if (res.status === 401) {
        router.replace(`/artists/login?callbackUrl=${encodeURIComponent("/artists/onboarding")}`);
        return;
      }
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error || "Failed to load onboarding");

      const data = payload as OnboardingResponse;
      setOnboardingComplete(data.onboardingComplete === true);
      setArtistKey(data.artistKey || "");
      setFullName(data.personal.fullName || "");
      setEmail(data.personal.email || "");
      setCity(data.personal.city || "");
      setCountry(data.personal.country || "");
      setBio(data.personal.bio || "");
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
  }, []);

  useEffect(() => {
    if (loading === false && onboardingComplete) {
      router.replace("/artists");
    }
  }, [loading, onboardingComplete, router]);

  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (fullName.trim().length < 2) return "Please enter your full name.";
      return null;
    }

    if (index === 1) {
      if (avatarUrl.trim().length === 0 && heroUrl.trim().length === 0 && galleryUrls.length === 0) {
        return "Please upload at least one profile image.";
      }
      return null;
    }

    if (index === 2) {
      return null;
    }

    if (index === 3) {
      if (acceptTerms === false) return "Please accept the terms.";
      for (const module of termsModules) {
        if (!termsChecked[module.documentSlug]) return `Please accept ${module.title}.`;
      }
      if (acceptedName.trim().length < 2) return "Please type your name for acceptance.";
      return null;
    }

    return null;
  };

  const handleUpload = async (file: File, kind: "avatar" | "hero" | "gallery") => {
    setError(null);
    setUploading(kind);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/artists/v2/media/upload", { method: "POST", body: formData });
      const payload = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            file?: { url?: string | null; previewUrl?: string | null };
          }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Upload failed");

      const resolvedUrl = payload?.file?.previewUrl || payload?.file?.url || "";
      if (resolvedUrl.length === 0) throw new Error("Upload failed");

      if (kind === "avatar") {
        setAvatarUrl(resolvedUrl);
      } else if (kind === "hero") {
        setHeroUrl(resolvedUrl);
      } else {
        setGalleryUrls((prev) => Array.from(new Set([...prev, resolvedUrl])).slice(0, 3));
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const onSubmit = async () => {
    const currentError = validateStep(3);
    if (currentError) {
      setError(currentError);
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
          personal: { fullName, city, country, bio },
          shopify: { handle: resolvedHandle, displayName: resolvedDisplayName, instagram },
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
      if (!res.ok) throw new Error(payload?.error || "Failed to submit onboarding");

      setOnboardingComplete(true);
      router.replace("/artists");
    } catch (err: any) {
      setError(err?.message || "Failed to submit onboarding");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.card}>Loading onboarding...</div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Welcome to ARTCLUB</h1>
        <p className={styles.subtitle}>Let&apos;s set up your artist profile</p>
      </div>

      <div className={styles.stepper}>
        {steps.map((item, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <div key={item.label} className={styles.stepItem}>
              {index < steps.length - 1 ? (
                <span className={`${styles.stepLine} ${done ? styles.stepLineDone : ""}`.trim()} aria-hidden="true" />
              ) : null}
              <span className={`${styles.stepCircle} ${done ? styles.stepCircleDone : ""} ${current ? styles.stepCircleCurrent : ""}`.trim()} aria-hidden="true">
                {done ? "✓" : index + 1}
              </span>
              <div>
                <div className={styles.stepLabel}>{item.label}</div>
                <div className={styles.stepSub}>{item.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.card}>
        <p className={styles.meta}>Artist key: {artistKey || "—"} · {onboardingComplete ? "completed" : "pending"}</p>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? <div className={styles.success}>{message}</div> : null}

        <div className={styles.section}>
          {step === 0 ? (
            <div className={styles.grid}>
              <label className="field">
                Full name
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
              </label>
              <label className="field">
                Email (locked)
                <input value={email} readOnly />
              </label>
              <label className="field">
                City
                <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Berlin" />
              </label>
              <label className="field">
                Country
                <input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Germany" />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                Short bio
                <textarea rows={4} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Share a bit about your artistic practice" />
              </label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className={styles.visualsGrid}>
              <div className={styles.visualCard}>
                <div className={styles.visualTitle}>Avatar</div>
                <div className={styles.visualPreviewSmall}>
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Avatar preview" className={styles.cover} />
                  ) : (
                    <span>Upload</span>
                  )}
                </div>
                <label className="btnGhost" style={{ marginTop: 10 }}>
                  {uploading === "avatar" ? "Uploading..." : "Choose image"}
                  <input
                    style={{ display: "none" }}
                    type="file"
                    accept="image/*"
                    disabled={uploading != null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file, "avatar");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className={styles.visualCard}>
                <div className={styles.visualTitle}>Header image</div>
                <div className={styles.visualPreviewWide}>
                  {heroUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={heroUrl} alt="Hero preview" className={styles.cover} />
                  ) : (
                    <span>Click to upload</span>
                  )}
                </div>
                <label className="btnGhost" style={{ marginTop: 10 }}>
                  {uploading === "hero" ? "Uploading..." : "Upload hero"}
                  <input
                    style={{ display: "none" }}
                    type="file"
                    accept="image/*"
                    disabled={uploading != null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleUpload(file, "hero");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className={styles.visualCard} style={{ gridColumn: "1 / -1" }}>
                <div className={styles.visualTitle}>Gallery images (1-3)</div>
                <div className={styles.galleryRow}>
                  {[0, 1, 2].map((slot) => {
                    const url = galleryUrls[slot];
                    return (
                      <div key={slot} className={styles.galleryTile}>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="Gallery" className={styles.cover} />
                        ) : (
                          <span>Upload</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <label className="btnGhost" style={{ marginTop: 10 }}>
                  {uploading === "gallery" ? "Uploading..." : "Add gallery image"}
                  <input
                    style={{ display: "none" }}
                    type="file"
                    accept="image/*"
                    disabled={uploading != null}
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

          {step === 2 ? (
            <div className={styles.consentList}>
              <label className={styles.consentItem}>
                <input type="checkbox" checked={sellOriginals} onChange={(event) => setSellOriginals(event.target.checked)} />
                <span>
                  <strong>ARTCLUB may sell my originals</strong>
                  <small>30% platform fee on sales</small>
                </span>
              </label>

              <label className={styles.consentItem}>
                <input type="checkbox" checked={sellPrints} onChange={(event) => setSellPrints(event.target.checked)} />
                <span>
                  <strong>ARTCLUB may sell prints/editions</strong>
                  <small>Artist gets 40% license fee</small>
                </span>
              </label>

              <label className={styles.consentItem}>
                <input type="checkbox" checked={rental} onChange={(event) => setRental(event.target.checked)} />
                <span>
                  <strong>ARTCLUB may rent my artworks</strong>
                  <small>30% platform fee on rental fees</small>
                </span>
              </label>

              <label className={styles.consentItem}>
                <input type="checkbox" checked={exhibitions} onChange={(event) => setExhibitions(event.target.checked)} />
                <span>
                  <strong>ARTCLUB may contact me for exhibitions</strong>
                  <small>We&apos;ll reach out with opportunities</small>
                </span>
              </label>

              <label className={styles.consentItem}>
                <input type="checkbox" checked={presentationOnly} onChange={(event) => setPresentationOnly(event.target.checked)} />
                <span>
                  <strong>Presentation-only profile</strong>
                  <small>Showcase only, no sales</small>
                </span>
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className={styles.sectionStack}>
              {termsModules.map((module) => (
                <div key={`${module.documentSlug}:${module.version}`} className={styles.termsCard}>
                  <div className={styles.termsTitle}>{module.title}</div>
                  <div className={styles.termsSub}>
                    {module.documentSlug} · v{module.version} · Effective {formatDate(module.effectiveAt)}
                  </div>

                  {termsHtml[module.documentSlug] ? (
                    <div className="md-preview" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: termsHtml[module.documentSlug] }} />
                  ) : (
                    <div className={styles.termsSub}>No terms body found.</div>
                  )}

                  <label className={styles.acceptItem}>
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
              ))}

              <label className={styles.acceptItem}>
                <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} />
                I accept the terms and conditions
              </label>

              <label className="field">
                Typed name for acceptance
                <input value={acceptedName} onChange={(event) => setAcceptedName(event.target.value)} placeholder="Type your full name" />
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className={styles.finishWrap}>
              <div className={styles.finishIcon}>✓</div>
              <div className={styles.finishTitle}>You&apos;re all set!</div>
              <div className={styles.finishSub}>Your artist profile is ready to go</div>

              <div className={styles.previewTable}>
                <div><span>Name</span><strong>{resolvedDisplayName}</strong></div>
                <div><span>Location</span><strong>{[city, country].filter(Boolean).join(", ") || "Not set"}</strong></div>
                <div><span>Bio</span><strong>{bio.trim().length > 0 ? "Set" : "Not set"}</strong></div>
                <div><span>Profile images</span><strong>{(avatarUrl ? 1 : 0) + (heroUrl ? 1 : 0) + galleryUrls.length} uploaded</strong></div>
                <div><span>Consents</span><strong>{[sellOriginals, sellPrints, rental, exhibitions, presentationOnly].filter(Boolean).length} enabled</strong></div>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.actions}>
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
              Continue
            </button>
          ) : (
            <button type="button" className="btnPrimary" disabled={saving} onClick={onSubmit}>
              {saving ? "Submitting..." : "Go to dashboard"}
            </button>
          )}
        </div>

        <div className={styles.history}>
          <div className={styles.historyTitle}>Accepted terms history</div>
          {acceptedTerms.length === 0 ? <div className={styles.historySub}>No acceptance records yet.</div> : null}
          {acceptedTerms.length > 0 ? (
            <ul className={styles.historyList}>
              {acceptedTerms.map((item) => (
                <li key={item.id}>
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
