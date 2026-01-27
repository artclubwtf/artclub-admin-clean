"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TERMS_VERSION = "v1";
const LAST_APPLICATION_KEY = "ac_application_last_id";
const AUTOSAVE_DELAY_MS = 800;
const TERMS_PDF_URL = process.env.NEXT_PUBLIC_TERMS_PDF_URL || "";

const steps = ["Personal", "Shopify fields", "Profile images", "Legal", "Submit"] as const;

type PersonalState = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
};

type ShopifyState = {
  instagramUrl: string;
  quote: string;
  einleitung_1: string;
  text_1: string;
  kategorieCollectionGid: string;
};

type ProfileImagesState = {
  titelbildGid: string;
  bild1Gid: string;
  bild2Gid: string;
  bild3Gid: string;
};

type LegalState = {
  accepted: boolean;
  acceptedName: string;
  termsVersion: string;
};

type UploadState = {
  uploading: boolean;
  error: string | null;
  success: string | null;
  filename: string | null;
  previewUrl: string | null;
};

type ProfileImageKey = keyof ProfileImagesState;

const profileImageFields: Array<{ key: ProfileImageKey; label: string; helper: string }> = [
  { key: "titelbildGid", label: "Titelbild", helper: "Primary profile image." },
  { key: "bild1Gid", label: "Bild 1", helper: "Additional profile image." },
  { key: "bild2Gid", label: "Bild 2", helper: "Additional profile image." },
  { key: "bild3Gid", label: "Bild 3", helper: "Additional profile image." },
];

function getUploadStateDefaults(): Record<ProfileImageKey, UploadState> {
  return {
    titelbildGid: { uploading: false, error: null, success: null, filename: null, previewUrl: null },
    bild1Gid: { uploading: false, error: null, success: null, filename: null, previewUrl: null },
    bild2Gid: { uploading: false, error: null, success: null, filename: null, previewUrl: null },
    bild3Gid: { uploading: false, error: null, success: null, filename: null, previewUrl: null },
  };
}

function parseErrorMessage(payload: any) {
  if (!payload) return "Unexpected error";
  if (typeof payload === "string") return payload;
  if (payload.error) {
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
  }
  return "Unexpected error";
}

function ApplyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvingRef = useRef<Set<string>>(new Set());

  const [currentStep, setCurrentStep] = useState(0);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [applicationToken, setApplicationToken] = useState<string | null>(null);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);

  const [personal, setPersonal] = useState<PersonalState>({
    fullName: "",
    email: "",
    phone: "",
    city: "",
    country: "",
  });
  const [shopify, setShopify] = useState<ShopifyState>({
    instagramUrl: "",
    quote: "",
    einleitung_1: "",
    text_1: "",
    kategorieCollectionGid: "",
  });
  const [profileImages, setProfileImages] = useState<ProfileImagesState>({
    titelbildGid: "",
    bild1Gid: "",
    bild2Gid: "",
    bild3Gid: "",
  });
  const [legal, setLegal] = useState<LegalState>({
    accepted: false,
    acceptedName: "",
    termsVersion: TERMS_VERSION,
  });

  const [uploadState, setUploadState] = useState<Record<ProfileImageKey, UploadState>>(getUploadStateDefaults);
  const [dragKey, setDragKey] = useState<ProfileImageKey | null>(null);

  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const draftPayload = useMemo(
    () => ({
      personal,
      shopify,
      profileImages,
      legal: {
        termsVersion: legal.accepted ? legal.termsVersion : "",
        acceptedName: legal.acceptedName,
      },
    }),
    [personal, shopify, profileImages, legal.accepted, legal.termsVersion, legal.acceptedName],
  );

  const saveDraft = useCallback(
    async (payload: typeof draftPayload) => {
      if (!applicationId || !applicationToken) return false;
      setSaveError(null);
      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-application-token": applicationToken,
          },
          body: JSON.stringify(payload),
        });
        const responsePayload = await res.json().catch(() => null);
        if (!res.ok) {
          setSaveStatus("error");
          setSaveError(responsePayload?.error || "Failed to save");
          return false;
        }
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        return true;
      } catch (err) {
        console.error("Failed to save application", err);
        setSaveStatus("error");
        setSaveError("Failed to save");
        return false;
      }
    },
    [applicationId, applicationToken],
  );

  const saveNow = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    return saveDraft(draftPayload);
  }, [draftPayload, saveDraft]);

  const resolveShopifyPreview = useCallback(async (gid: string) => {
    const res = await fetch(`/api/shopify/files/resolve?ids=${encodeURIComponent(gid)}`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload) return null;
    const files = Array.isArray(payload.files) ? payload.files : [];
    const match = files.find((file: any) => file?.id === gid);
    return match?.previewImage || match?.url || null;
  }, []);

  useEffect(() => {
    if (!autosaveEnabled || !applicationId || !applicationToken) return undefined;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveDraft(draftPayload);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [autosaveEnabled, applicationId, applicationToken, draftPayload, saveDraft]);

  useEffect(() => {
    const gidToKey = new Map<string, ProfileImageKey>();
    for (const field of profileImageFields) {
      const gid = profileImages[field.key];
      if (gid) gidToKey.set(gid, field.key);
    }

    const missing = Array.from(gidToKey.entries())
      .filter(([gid, key]) => {
        const hasPreview = Boolean(uploadState[key]?.previewUrl);
        return !hasPreview && !resolvingRef.current.has(gid);
      })
      .map(([gid]) => gid);

    if (!missing.length) return;

    missing.forEach((gid) => resolvingRef.current.add(gid));

    const run = async () => {
      try {
        const res = await fetch(`/api/shopify/files/resolve?ids=${encodeURIComponent(missing.join(","))}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload) return;
        const files = Array.isArray(payload.files) ? payload.files : [];
        if (!files.length) return;

        setUploadState((prev) => {
          const next = { ...prev };
          for (const file of files) {
            const key = gidToKey.get(file?.id);
            if (!key) continue;
            const previewUrl = file.previewImage || file.url || null;
            if (!previewUrl) continue;
            next[key] = { ...next[key], previewUrl };
          }
          return next;
        });
      } finally {
        missing.forEach((gid) => resolvingRef.current.delete(gid));
      }
    };

    void run();
  }, [profileImages, uploadState]);

  useEffect(() => {
    if (autosaveEnabled || initializing) return;
    if (applicationId && applicationToken) {
      setAutosaveEnabled(true);
    }
  }, [autosaveEnabled, initializing, applicationId, applicationToken]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      setInitializing(true);
      setInitError(null);

      const queryApplicationId = searchParams.get("applicationId");
      const queryToken = searchParams.get("token");

      const tryLoadApplication = async (id: string, token: string) => {
        const res = await fetch(`/api/applications/${encodeURIComponent(id)}`, {
          headers: { "x-application-token": token },
          cache: "no-store",
        });
        if (!res.ok) return false;
        const payload = await res.json().catch(() => null);
        const application = payload?.application;
        if (!application) return false;

        setApplicationId(id);
        setApplicationToken(token);
        setApplicationStatus(application.status || null);

        setPersonal({
          fullName: application.personal?.fullName ?? "",
          email: application.personal?.email ?? "",
          phone: application.personal?.phone ?? "",
          city: application.personal?.city ?? "",
          country: application.personal?.country ?? "",
        });
        setShopify({
          instagramUrl: application.shopify?.instagramUrl ?? "",
          quote: application.shopify?.quote ?? "",
          einleitung_1: application.shopify?.einleitung_1 ?? "",
          text_1: application.shopify?.text_1 ?? "",
          kategorieCollectionGid: application.shopify?.kategorieCollectionGid ?? "",
        });
        setProfileImages({
          titelbildGid: application.profileImages?.titelbildGid ?? "",
          bild1Gid: application.profileImages?.bild1Gid ?? "",
          bild2Gid: application.profileImages?.bild2Gid ?? "",
          bild3Gid: application.profileImages?.bild3Gid ?? "",
        });
        setLegal((prev) => ({
          ...prev,
          acceptedName: application.legal?.acceptedName ?? "",
          accepted: Boolean(application.legal?.termsVersion && String(application.legal.termsVersion).trim()),
        }));

        try {
          localStorage.setItem(id, token);
          localStorage.setItem(LAST_APPLICATION_KEY, id);
        } catch (err) {
          console.warn("Failed to persist application token", err);
        }

        return true;
      };

      const createApplication = async () => {
        const res = await fetch("/api/applications/create", { method: "POST" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || "Failed to create application");
        }
        const id = payload?.applicationId as string | undefined;
        const token = payload?.token as string | undefined;
        if (!id || !token) {
          throw new Error("Invalid response from application create");
        }

        setApplicationId(id);
        setApplicationToken(token);
        setApplicationStatus("draft");

        try {
          localStorage.setItem(id, token);
          localStorage.setItem(LAST_APPLICATION_KEY, id);
        } catch (err) {
          console.warn("Failed to persist application token", err);
        }
      };

      try {
        const queryReady = queryApplicationId && queryToken;
        if (queryReady) {
          const ok = await tryLoadApplication(queryApplicationId, queryToken);
          if (!ok) {
            await createApplication();
          }
          setInitializing(false);
          return;
        }

        const storedId = typeof window !== "undefined" ? localStorage.getItem(LAST_APPLICATION_KEY) : null;
        const storedToken = storedId ? localStorage.getItem(storedId) : null;
        if (storedId && storedToken) {
          const ok = await tryLoadApplication(storedId, storedToken);
          if (ok) {
            setInitializing(false);
            return;
          }
        }

        await createApplication();
        setInitializing(false);
      } catch (err: any) {
        console.error("Failed to initialize application", err);
        setInitError(err?.message || "Failed to initialize application");
        setInitializing(false);
      }
    };

    void init();
  }, [searchParams]);

  const validateStep = (stepIndex: number) => {
    const errors: string[] = [];

    if (stepIndex === 0) {
      if (!personal.fullName.trim()) errors.push("Full name is required.");
      if (!personal.email.trim()) errors.push("Email is required.");
      if (personal.email && !personal.email.includes("@")) errors.push("Email looks invalid.");
    }

    if (stepIndex === 1) {
      if (!shopify.instagramUrl.trim()) errors.push("Instagram is required.");
      if (!shopify.quote.trim()) errors.push("Quote is required.");
      if (!shopify.einleitung_1.trim()) errors.push("Intro text is required.");
      if (!shopify.text_1.trim()) errors.push("Main text is required.");
    }

    if (stepIndex === 2) {
      const hasImage = [profileImages.titelbildGid, profileImages.bild1Gid, profileImages.bild2Gid, profileImages.bild3Gid].some(
        (value) => value.trim(),
      );
      if (!hasImage) errors.push("Please upload at least one profile image.");
    }

    if (stepIndex === 3) {
      if (!legal.accepted) errors.push("Please accept the terms.");
      if (!legal.acceptedName.trim()) errors.push("Name is required.");
    }

    setStepErrors(errors);
    return errors.length === 0;
  };

  const handleNext = async () => {
    setStepErrors([]);
    if (!validateStep(currentStep)) return;
    const saved = await saveNow();
    if (!saved) return;
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setStepErrors([]);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleUpload = async (key: ProfileImageKey, file: File) => {
    setUploadState((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        uploading: true,
        error: null,
        success: null,
        filename: file.name,
      },
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/shopify/files/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseErrorMessage(payload));
      }
      const gid = payload?.fileIdGid as string | undefined;
      const payloadPreviewUrl = typeof payload?.url === "string" ? payload.url : null;
      let resolvedUrl: string | null = null;

      if (gid) {
        setProfileImages((prev) => ({ ...prev, [key]: gid }));
        resolvedUrl = await resolveShopifyPreview(gid);
      }

      const finalPreviewUrl = resolvedUrl || payloadPreviewUrl || null;

      setUploadState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          uploading: false,
          error: null,
          success: payload?.filename ? `Uploaded: ${payload.filename}` : "Upload successful",
          previewUrl: finalPreviewUrl,
        },
      }));
    } catch (err: any) {
      setUploadState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          uploading: false,
          error: err?.message || "Upload failed",
          success: null,
        },
      }));
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!applicationId || !applicationToken) {
      setSubmitError("Missing application token.");
      return;
    }

    if (!validateStep(3)) {
      setCurrentStep(3);
      return;
    }

    const saved = await saveNow();
    if (!saved) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-application-token": applicationToken,
        },
        body: JSON.stringify({
          accepted: legal.accepted,
          legal: {
            acceptedName: legal.acceptedName,
            termsVersion: legal.termsVersion,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const errorMessage = payload?.error || "Failed to submit";
        setSubmitError(errorMessage);
        if (payload?.fieldErrors) {
          const fieldErrors = Object.values(payload.fieldErrors) as string[];
          setStepErrors(fieldErrors.filter(Boolean));
        }
        return;
      }

      router.replace(`/apply/${encodeURIComponent(applicationId)}/dashboard?token=${encodeURIComponent(applicationToken)}`);
    } catch (err) {
      console.error("Failed to submit application", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const progressValue = ((currentStep + 1) / steps.length) * 100;

  if (initializing) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 640, margin: "40px auto" }}>
          <p className="text-sm text-slate-600">Loading application...</p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="ap-shell">
        <div className="ap-card" style={{ maxWidth: 640, margin: "40px auto" }}>
          <h1 className="text-xl font-semibold text-slate-900">Unable to start application</h1>
          <p className="mt-2 text-sm text-slate-600">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-shell">
      <div className="ap-header">
        <div>
          <div className="ap-eyebrow">Application</div>
          <h1 className="ap-title">Artist application</h1>
          <p className="ap-subtitle">Complete the steps below. Your progress saves automatically.</p>
        </div>
        <div className="ap-save">
          {saveStatus === "saving" ? <span>Saving...</span> : null}
          {saveStatus === "saved" ? <span>Saved {lastSavedAt ? lastSavedAt.toLocaleTimeString() : ""}</span> : null}
          {saveStatus === "error" ? <span className="text-red-600">Save failed</span> : null}
        </div>
      </div>

      <div className="ap-progress">
        <div className="ap-progress-meta">
          <span>
            Step {currentStep + 1} / {steps.length}
          </span>
          <span>Status: {applicationStatus || "draft"}</span>
        </div>
        <div className="ap-progress-bar">
          <span style={{ width: `${progressValue}%` }} />
        </div>
      </div>

      <div className="ap-stepper">
        {steps.map((step, index) => {
          const className = ["ap-pill"];
          if (index === currentStep) className.push("ap-pill-active");
          if (index < currentStep) className.push("ap-pill-done");
          return (
            <div key={step} className={className.join(" ")}>
              {step}
            </div>
          );
        })}
      </div>

      {saveError ? <div className="ap-alert">Save failed: {saveError}</div> : null}
      {stepErrors.length > 0 ? (
        <div className="ap-alert">
          {stepErrors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}

      <div className="ap-card">
        <div className="ap-card-title">{steps[currentStep]}</div>

        {currentStep === 0 ? (
          <div className="grid gap-4">
            <label className="field">
              Full name
              <input
                type="text"
                value={personal.fullName}
                onChange={(e) => setPersonal((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Your full name"
              />
            </label>
            <label className="field">
              Email
              <input
                type="email"
                value={personal.email}
                onChange={(e) => setPersonal((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </label>
            <label className="field">
              Phone
              <input
                type="tel"
                value={personal.phone}
                onChange={(e) => setPersonal((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                City
                <input
                  type="text"
                  value={personal.city}
                  onChange={(e) => setPersonal((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="field">
                Country
                <input
                  type="text"
                  value={personal.country}
                  onChange={(e) => setPersonal((prev) => ({ ...prev, country: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>
          </div>
        ) : null}

        {currentStep === 1 ? (
          <div className="grid gap-4">
            <label className="field">
              Instagram URL
              <input
                type="text"
                value={shopify.instagramUrl}
                onChange={(e) => setShopify((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                placeholder="https://instagram.com/yourhandle"
              />
            </label>
            <label className="field">
              Quote
              <textarea
                value={shopify.quote}
                onChange={(e) => setShopify((prev) => ({ ...prev, quote: e.target.value }))}
                placeholder="Short quote"
                rows={2}
              />
            </label>
            <label className="field">
              Intro text
              <textarea
                value={shopify.einleitung_1}
                onChange={(e) => setShopify((prev) => ({ ...prev, einleitung_1: e.target.value }))}
                placeholder="Short intro"
                rows={3}
              />
            </label>
            <label className="field">
              Main text
              <textarea
                value={shopify.text_1}
                onChange={(e) => setShopify((prev) => ({ ...prev, text_1: e.target.value }))}
                placeholder="Tell us about your work"
                rows={4}
              />
            </label>
            <p className="ap-note">We'll assign the right category after review.</p>
            <details className="ap-advanced">
              <summary className="text-sm font-semibold text-slate-700">Optional: add a category collection GID</summary>
              <div className="mt-3">
                <label className="field">
                  Category collection GID (optional)
                  <input
                    type="text"
                    value={shopify.kategorieCollectionGid}
                    onChange={(e) => setShopify((prev) => ({ ...prev, kategorieCollectionGid: e.target.value }))}
                    placeholder="gid://shopify/Collection/..."
                  />
                </label>
              </div>
            </details>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="grid gap-4">
            {profileImageFields.map((field) => {
              const state = uploadState[field.key];
              const currentGid = profileImages[field.key];
              const isDragActive = dragKey === field.key;
              return (
                <div
                  key={field.key}
                  className={`ap-dropzone ${isDragActive ? "ap-dropzone-active" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragKey(field.key);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (dragKey === field.key) setDragKey(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragKey(null);
                    const file = event.dataTransfer.files?.[0];
                    if (file) {
                      void handleUpload(field.key, file);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{field.label}</div>
                      <div className="text-xs text-slate-500">{field.helper}</div>
                      {currentGid ? <div className="mt-2 text-xs text-slate-600">GID: {currentGid}</div> : null}
                    </div>
                    <label className="btnGhost">
                      {state.uploading ? "Uploading..." : currentGid ? "Replace" : "Upload"}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleUpload(field.key, file);
                          }
                          e.currentTarget.value = "";
                        }}
                        disabled={state.uploading}
                      />
                    </label>
                  </div>
                  <div className="text-xs text-slate-500">Drag & drop or click to upload. JPG, PNG, HEIC, WEBP - Max 20MB.</div>
                  {state.previewUrl ? (
                    <img
                      src={state.previewUrl}
                      alt={state.filename || field.label}
                      className="h-28 w-40 rounded-md object-cover"
                    />
                  ) : null}
                  {state.error ? <div className="text-xs font-semibold text-red-600">{state.error}</div> : null}
                  {state.success ? <div className="text-xs font-semibold text-emerald-700">{state.success}</div> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="grid gap-4">
            <label className="field">
              Accepted name
              <input
                type="text"
                value={legal.acceptedName}
                onChange={(e) => setLegal((prev) => ({ ...prev, acceptedName: e.target.value }))}
                placeholder="Your full name"
              />
            </label>
            <div className="ap-note">
              <p>By submitting, you confirm you are the rights holder for the submitted works.</p>
              {TERMS_PDF_URL ? (
                <a href={TERMS_PDF_URL} target="_blank" rel="noreferrer" className="text-sm text-slate-600 underline">
                  Download terms (PDF)
                </a>
              ) : null}
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={legal.accepted}
                onChange={(e) => setLegal((prev) => ({ ...prev, accepted: e.target.checked }))}
              />
              <span>I accept the terms (version {legal.termsVersion}).</span>
            </label>
          </div>
        ) : null}

        {currentStep === 4 ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>Review your application and submit when ready.</p>
            <div className="ap-dropzone">
              <div className="font-semibold text-slate-900">Summary</div>
              <div className="mt-2">Name: {personal.fullName || "—"}</div>
              <div>Email: {personal.email || "—"}</div>
              <div>Instagram: {shopify.instagramUrl || "—"}</div>
              <div>Images uploaded: {Object.values(profileImages).filter((value) => value.trim()).length}</div>
            </div>
            {submitError ? <div className="text-sm font-semibold text-red-600">{submitError}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="ap-actions">
        <button type="button" className="btnGhost" onClick={handleBack} disabled={currentStep === 0}>
          Back
        </button>
        {currentStep < steps.length - 1 ? (
          <button type="button" className="btnPrimary" onClick={handleNext}>
            Next
          </button>
        ) : (
          <button type="button" className="btnPrimary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="ap-shell">
          <div className="ap-card" style={{ maxWidth: 640, margin: "40px auto" }}>
            <p className="text-sm text-slate-600">Loading application...</p>
          </div>
        </div>
      }
    >
      <ApplyPageContent />
    </Suspense>
  );
}
