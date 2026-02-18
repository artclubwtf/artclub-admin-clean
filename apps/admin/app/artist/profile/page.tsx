"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PublicProfile = {
  name?: string;
  displayName?: string;
  quote?: string;
  einleitung_1?: string;
  text_1?: string;
  bio?: string;
  instagram?: string;
  website?: string;
  location?: string;
  bilder?: string;
  bild_1?: string;
  bild_2?: string;
  bild_3?: string;
};

type ArtistProfileResponse = {
  id: string;
  name: string;
  stage?: string;
  publicProfile?: PublicProfile;
  platformSync?: {
    status?: string;
    lastSyncedAt?: string;
    lastError?: string;
  };
};

type RequestItem = {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
};

type FormState = {
  name: string;
  quote: string;
  einleitung_1: string;
  text_1: string;
  instagram: string;
  website: string;
  location: string;
};

type ImageKey = "bilder" | "bild_1" | "bild_2" | "bild_3";

const imageLabels: Record<ImageKey, string> = {
  bilder: "Title image",
  bild_1: "Image 1",
  bild_2: "Image 2",
  bild_3: "Image 3",
};

const imageKeys: ImageKey[] = ["bilder", "bild_1", "bild_2", "bild_3"];

const emptyForm: FormState = {
  name: "",
  quote: "",
  einleitung_1: "",
  text_1: "",
  instagram: "",
  website: "",
  location: "",
};

export default function ArtistProfilePage() {
  const [profile, setProfile] = useState<ArtistProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<RequestItem[]>([]);

  const [imageUploads, setImageUploads] = useState<Record<ImageKey, boolean>>({
    bilder: false,
    bild_1: false,
    bild_2: false,
    bild_3: false,
  });
  const [imageErrors, setImageErrors] = useState<Record<ImageKey, string | null>>({
    bilder: null,
    bild_1: null,
    bild_2: null,
    bild_3: null,
  });
  const [imagePreviews, setImagePreviews] = useState<Record<ImageKey, string | null>>({
    bilder: null,
    bild_1: null,
    bild_2: null,
    bild_3: null,
  });
  const [imageMessages, setImageMessages] = useState<Record<ImageKey, string | null>>({
    bilder: null,
    bild_1: null,
    bild_2: null,
    bild_3: null,
  });

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/me", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ArtistProfileResponse | { error?: string } | null;
      if (!res.ok) {
        throw new Error((payload as { error?: string })?.error || "Failed to load profile");
      }
      const data = payload as ArtistProfileResponse;
      setProfile(data);
      setForm({
        name: data.publicProfile?.displayName || data.publicProfile?.name || "",
        quote: data.publicProfile?.quote || "",
        einleitung_1: data.publicProfile?.einleitung_1 || "",
        text_1: data.publicProfile?.text_1 || data.publicProfile?.bio || "",
        instagram: data.publicProfile?.instagram || "",
        website: data.publicProfile?.website || "",
        location: data.publicProfile?.location || "",
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const res = await fetch("/api/artist/requests", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { requests?: RequestItem[] } | null;
      if (!res.ok) return;
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadProfile();
    loadRequests();
  }, []);

  const profileRequests = useMemo(
    () => requests.filter((r) => r.type === "profile_update"),
    [requests],
  );

  const activeProfile = profile?.publicProfile || {};
  const imageIds = useMemo(
    () =>
      imageKeys.map((key) => ({ key, id: activeProfile[key] })).filter((entry) => Boolean(entry.id)),
    [activeProfile],
  );

  useEffect(() => {
    const ids = imageIds.map((entry) => entry.id).filter(Boolean) as string[];
    if (!ids.length) {
      setImagePreviews({ bilder: null, bild_1: null, bild_2: null, bild_3: null });
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/shopify/files/resolve?ids=${encodeURIComponent(ids.join(","))}`, {
          cache: "no-store",
        });
        const payload = (await res.json().catch(() => null)) as { files?: Array<{ id: string; url?: string | null; previewImage?: string | null }> } | null;
        if (!res.ok) return;
        const map: Record<string, string | null> = {};
        (payload?.files || []).forEach((file) => {
          map[file.id] = file.previewImage || file.url || null;
        });
        setImagePreviews((prev) => {
          const next = { ...prev };
          imageIds.forEach(({ key, id }) => {
            if (id && map[id]) next[key] = map[id];
          });
          return next;
        });
      } catch {
        // ignore
      }
    };

    load();
  }, [imageIds]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitting(true);
    try {
      const payload = {
        type: "profile_update",
        payload: {
          publicProfile: {
            name: form.name.trim() || null,
            displayName: form.name.trim() || null,
            quote: form.quote.trim() || null,
            einleitung_1: form.einleitung_1.trim() || null,
            text_1: form.text_1.trim() || null,
            instagram: form.instagram.trim() || null,
            website: form.website.trim() || null,
            location: form.location.trim() || null,
          },
        },
      };

      const res = await fetch("/api/artist/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const response = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(response?.error || "Request failed");
      setSubmitSuccess("Changes submitted. We will review and confirm before they go live.");
      loadRequests();
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = async (key: ImageKey, file: File | null) => {
    if (!file) return;
    setImageUploads((prev) => ({ ...prev, [key]: true }));
    setImageErrors((prev) => ({ ...prev, [key]: null }));
    setImageMessages((prev) => ({ ...prev, [key]: null }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/shopify/files/upload", { method: "POST", body: formData });
      const uploadPayload = (await uploadRes.json().catch(() => null)) as { fileIdGid?: string; url?: string } | { error?: string } | null;
      if (!uploadRes.ok || !uploadPayload || !("fileIdGid" in uploadPayload)) {
        throw new Error((uploadPayload as { error?: string })?.error || "Upload failed");
      }

      const fileId = uploadPayload.fileIdGid as string;
      const syncRes = await fetch("/api/artist/profile-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, fileId }),
      });
      const syncPayload = (await syncRes.json().catch(() => null)) as { error?: string; platformSync?: { status?: string } } | null;
      if (!syncRes.ok) {
        throw new Error(syncPayload?.error || "Platform sync failed");
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              publicProfile: { ...(prev.publicProfile || {}), [key]: fileId },
            }
          : prev,
      );
      setImagePreviews((prev) => ({ ...prev, [key]: uploadPayload.url || prev[key] || null }));
      setImageMessages((prev) => ({
        ...prev,
        [key]: syncPayload?.platformSync?.status === "pending" ? "Saved. Sync pending." : "Saved and synced.",
      }));
    } catch {
      setImageErrors((prev) => ({ ...prev, [key]: "Upload failed. Please try again." }));
    } finally {
      setImageUploads((prev) => ({ ...prev, [key]: false }));
    }
  };

  const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "—");

  return (
    <div className="space-y-4">
      <div className="artist-card">
        <div className="artist-section-title">Profile</div>
        <div className="artist-section-sub">Update your public profile. Changes require review.</div>
      </div>

      {loading && <div className="artist-card artist-placeholder">Loading profile...</div>}
      {error && <div className="artist-card artist-placeholder">Error: {error}</div>}

      {!loading && !error && (
        <>
          <div className="artist-card space-y-2">
            <div className="artist-section-title">Platform images</div>
            <div className="artist-section-sub">
              Upload your profile images. These update immediately on the platform.
            </div>
            <div className="artist-grid">
              {imageKeys.map((key) => (
                <div key={key} className="artist-media-card">
                  <div className="artist-section-title" style={{ fontSize: 15 }}>
                    {imageLabels[key]}
                  </div>
                  <div className="artist-media-preview" style={{ height: 160 }}>
                    {imagePreviews[key] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreviews[key] as string} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-xs text-slate-500">No image</div>
                    )}
                  </div>
                  <div className="artist-media-actions">
                    <label className="artist-btn-ghost" style={{ width: "100%", textAlign: "center" }}>
                      {imageUploads[key] ? "Uploading..." : "Upload image"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={imageUploads[key]}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          handleImageUpload(key, file);
                          if (e.target) e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  {imageMessages[key] && <div className="text-xs text-green-600">{imageMessages[key]}</div>}
                  {imageErrors[key] && <div className="text-xs text-red-600">{imageErrors[key]}</div>}
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-500">
              Platform sync status: {profile?.platformSync?.status || "unknown"}
              {profile?.platformSync?.lastSyncedAt ? ` · Last sync ${formatDate(profile.platformSync.lastSyncedAt)}` : ""}
            </div>
          </div>

          <form className="artist-card space-y-3" onSubmit={handleSubmit}>
            <div className="artist-section-title">Request profile changes</div>
            <div className="artist-section-sub">
              Edit your profile details and submit for approval. We will review before publishing.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={form.name} onChange={(v) => updateForm("name", v)} />
              <Field label="Instagram" value={form.instagram} onChange={(v) => updateForm("instagram", v)} />
              <Field label="Website" value={form.website} onChange={(v) => updateForm("website", v)} />
              <Field label="Location" value={form.location} onChange={(v) => updateForm("location", v)} />
              <Field label="Quote" value={form.quote} onChange={(v) => updateForm("quote", v)} />
            </div>
            <Field label="Intro" value={form.einleitung_1} onChange={(v) => updateForm("einleitung_1", v)} multiline />
            <Field label="Bio" value={form.text_1} onChange={(v) => updateForm("text_1", v)} multiline rows={5} />

            {submitError && <div className="artist-placeholder">Error: {submitError}</div>}
            {submitSuccess && <div className="artist-placeholder">Success: {submitSuccess}</div>}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="artist-btn" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit changes"}
              </button>
              <button
                type="button"
                className="artist-btn-ghost"
                onClick={() => {
                  if (profile) {
                    setForm({
                      name: profile.publicProfile?.displayName || profile.publicProfile?.name || "",
                      quote: profile.publicProfile?.quote || "",
                      einleitung_1: profile.publicProfile?.einleitung_1 || "",
                      text_1: profile.publicProfile?.text_1 || profile.publicProfile?.bio || "",
                      instagram: profile.publicProfile?.instagram || "",
                      website: profile.publicProfile?.website || "",
                      location: profile.publicProfile?.location || "",
                    });
                  } else {
                    setForm(emptyForm);
                  }
                }}
              >
                Reset
              </button>
            </div>
          </form>

          <div className="artist-card space-y-2">
            <div className="artist-section-title">Recent profile requests</div>
            <div className="artist-section-sub">Track the review status of your submitted changes.</div>
            {profileRequests.length === 0 ? (
              <div className="artist-placeholder">No profile requests yet.</div>
            ) : (
              <ul className="space-y-2">
                {profileRequests.map((req) => (
                  <li key={req.id} className="rounded-lg bg-white/60 p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">Profile update</div>
                      <span className="artist-chip">{req.status}</span>
                    </div>
                    <div className="text-xs text-slate-500">{req.createdAt ? formatDate(req.createdAt) : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          rows={rows || 3}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder={label}
        />
      )}
    </label>
  );
}
