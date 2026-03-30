"use client";

import { ChangeEvent, useEffect, useState } from "react";

import EmptyState from "@/app/artists/_components/EmptyState";
import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type MediaItem = {
  id: string;
  kind: "artwork" | "gallery" | "avatar" | "hero" | "other";
  filename: string;
  url: string;
  previewUrl: string;
  createdAt?: string;
};

type ProfileState = {
  avatarUrl: string;
  heroUrl: string;
  galleryUrls: string[];
};

const kindOptions: Array<{ value: MediaItem["kind"]; label: string }> = [
  { value: "artwork", label: "Artwork" },
  { value: "gallery", label: "Gallery" },
  { value: "avatar", label: "Avatar" },
  { value: "hero", label: "Hero" },
  { value: "other", label: "Other" },
];

export default function ArtistsMediaPage() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<MediaItem["kind"]>("artwork");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [profile, setProfile] = useState<ProfileState>({ avatarUrl: "", heroUrl: "", galleryUrls: [] });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mediaRes, profileRes] = await Promise.all([
        fetch("/api/artists/v2/media", { cache: "no-store" }),
        fetch("/api/artists/v3/profile", { cache: "no-store" }),
      ]);

      const mediaPayload = (await mediaRes.json().catch(() => null)) as { media?: MediaItem[]; error?: string } | null;
      if (!mediaRes.ok) throw new Error(mediaPayload?.error || "Failed to load media");

      const profilePayload = (await profileRes.json().catch(() => null)) as
        | { profile?: { profileImages?: ProfileState }; error?: string }
        | null;
      if (!profileRes.ok) throw new Error(profilePayload?.error || "Failed to load profile images");

      setMedia(Array.isArray(mediaPayload?.media) ? mediaPayload!.media : []);
      setProfile({
        avatarUrl: profilePayload?.profile?.profileImages?.avatarUrl || "",
        heroUrl: profilePayload?.profile?.profileImages?.heroUrl || "",
        galleryUrls: Array.isArray(profilePayload?.profile?.profileImages?.galleryUrls)
          ? profilePayload!.profile!.profileImages!.galleryUrls
          : [],
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
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

        const uploadRes = await fetch("/api/artists/v2/media/upload", { method: "POST", body: formData });
        const uploadPayload = (await uploadRes.json().catch(() => null)) as
          | {
              error?: string;
              file?: { filename?: string; mimeType?: string; sizeBytes?: number; url?: string; previewUrl?: string };
            }
          | null;
        if (!uploadRes.ok) throw new Error(uploadPayload?.error || "Upload failed");

        const saveRes = await fetch("/api/artists/v2/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: uploadKind,
            url: uploadPayload?.file?.url,
            previewUrl: uploadPayload?.file?.previewUrl || uploadPayload?.file?.url,
            filename: uploadPayload?.file?.filename || file.name,
            mimeType: uploadPayload?.file?.mimeType || file.type,
            sizeBytes: uploadPayload?.file?.sizeBytes ?? file.size,
          }),
        });
        const savePayload = (await saveRes.json().catch(() => null)) as { error?: string } | null;
        if (!saveRes.ok) throw new Error(savePayload?.error || "Failed to save media");
      }

      await load();
      setMessage("Upload complete.");
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/artists/v2/media/${id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to delete media");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete media");
    } finally {
      setDeletingId(null);
    }
  };

  const onSaveProfileImages = async () => {
    setSavingProfile(true);
    setError(null);
    try {
      const res = await fetch("/api/artists/v3/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileImages: profile }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to save profile images");
      setMessage("Profile images saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save profile images");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <PageShell title="Media" subtitle="Manage profile images and uploaded assets with live previews">
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <SectionCard title="Upload" subtitle="Upload images and classify by media type">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <label className="field">
            Kind
            <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as MediaItem["kind"])}>
              {kindOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="btnGhost inline-flex cursor-pointer items-center justify-center self-end">
            {uploading ? "Uploading..." : "Upload image(s)"}
            <input className="hidden" type="file" accept="image/*" multiple disabled={uploading} onChange={onUpload} />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Profile images" subtitle="Avatar, hero and gallery selection">
        <div className="grid gap-3 lg:grid-cols-3">
          <MediaPicker
            title="Avatar"
            selectedUrl={profile.avatarUrl}
            media={media}
            onSelect={(url) => setProfile((prev) => ({ ...prev, avatarUrl: prev.avatarUrl === url ? "" : url }))}
          />
          <MediaPicker
            title="Hero"
            selectedUrl={profile.heroUrl}
            media={media}
            onSelect={(url) => setProfile((prev) => ({ ...prev, heroUrl: prev.heroUrl === url ? "" : url }))}
          />
          <MediaPicker
            title="Gallery"
            selectedUrls={profile.galleryUrls}
            media={media}
            multi
            onSelect={(url) =>
              setProfile((prev) => ({
                ...prev,
                galleryUrls: prev.galleryUrls.includes(url)
                  ? prev.galleryUrls.filter((item) => item !== url)
                  : [...prev.galleryUrls, url].slice(0, 10),
              }))
            }
          />
        </div>

        <div className="mt-3 flex justify-end">
          <button className="btnPrimary" type="button" onClick={onSaveProfileImages} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save profile images"}
          </button>
        </div>
      </SectionCard>

      {loading ? <div className="text-sm text-slate-600">Loading media…</div> : null}

      {!loading && media.length === 0 ? (
        <EmptyState title="No media uploaded" description="Upload images to use them in profile and artworks." />
      ) : null}

      {!loading && media.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {media.map((item) => (
            <div key={item.id} className="rounded border border-slate-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl || item.url} alt={item.filename} className="h-32 w-full rounded object-cover" />
              <div className="mt-1 text-xs font-semibold text-slate-800">{item.filename || "media"}</div>
              <div className="text-xs text-slate-500">{item.kind}</div>
              <button className="btnGhost mt-2 w-full" type="button" onClick={() => void onDelete(item.id)} disabled={deletingId === item.id}>
                {deletingId === item.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}

type MediaPickerProps = {
  title: string;
  media: MediaItem[];
  selectedUrl?: string;
  selectedUrls?: string[];
  multi?: boolean;
  onSelect: (url: string) => void;
};

function MediaPicker({ title, media, selectedUrl, selectedUrls = [], multi = false, onSelect }: MediaPickerProps) {
  return (
    <div className="rounded border border-slate-200 p-2">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 grid max-h-72 gap-2 overflow-auto">
        {media.map((item) => {
          const url = item.previewUrl || item.url;
          const selected = multi ? selectedUrls.includes(url) : selectedUrl === url;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(url)}
              className={`rounded border p-1 text-left ${selected ? "border-slate-900" : "border-slate-200"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={item.filename} className="h-20 w-full rounded object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
