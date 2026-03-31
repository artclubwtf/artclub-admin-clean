"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import ui from "../workspace-ui.module.css";

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
  const [tab, setTab] = useState<"profile" | "library">("profile");

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

      setMedia(Array.isArray(mediaPayload?.media) ? mediaPayload?.media || [] : []);
      setProfile({
        avatarUrl: profilePayload?.profile?.profileImages?.avatarUrl || "",
        heroUrl: profilePayload?.profile?.profileImages?.heroUrl || "",
        galleryUrls: Array.isArray(profilePayload?.profile?.profileImages?.galleryUrls)
          ? profilePayload?.profile?.profileImages?.galleryUrls || []
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
    if (files.length === 0) return;

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
            sizeBytes: uploadPayload?.file?.sizeBytes || file.size,
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
    setMessage(null);
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

  const selectableMedia = useMemo(
    () => media.filter((item) => item.previewUrl || item.url),
    [media],
  );

  const selectAvatar = (url: string) => setProfile((prev) => ({ ...prev, avatarUrl: prev.avatarUrl === url ? "" : url }));
  const selectHero = (url: string) => setProfile((prev) => ({ ...prev, heroUrl: prev.heroUrl === url ? "" : url }));
  const toggleGallery = (url: string) =>
    setProfile((prev) => ({
      ...prev,
      galleryUrls: prev.galleryUrls.includes(url)
        ? prev.galleryUrls.filter((item) => item !== url)
        : [...prev.galleryUrls, url].slice(0, 3),
    }));

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      {message ? <div className={ui.success}>{message}</div> : null}

      <div className={ui.pageIntro}>
        <div className={ui.pageTitle}>Media library</div>
        <div className={ui.pageSub}>Manage your profile images and uploads</div>
      </div>

      <div className={ui.mediaTabs}>
        <button className={`${ui.mediaTab} ${tab === "profile" ? ui.mediaTabActive : ""}`.trim()} type="button" onClick={() => setTab("profile")}>
          Profile Images
        </button>
        <button className={`${ui.mediaTab} ${tab === "library" ? ui.mediaTabActive : ""}`.trim()} type="button" onClick={() => setTab("library")}>
          Upload Library
        </button>
      </div>

      {loading ? <div className={ui.muted} style={{ marginTop: 12 }}>Loading media...</div> : null}

      {loading === false && tab === "profile" ? (
        <>
          <div className={ui.mediaSection}>
            <div className={ui.mediaLabel}>Avatar</div>
            <div className={ui.rowActions} style={{ marginTop: 10 }}>
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="Avatar" className={ui.mediaAvatar} />
              ) : (
                <div className={ui.mediaAvatar} />
              )}
              <button className="btnGhost" type="button" onClick={() => setProfile((prev) => ({ ...prev, avatarUrl: "" }))}>
                Remove
              </button>
            </div>
            <div className={ui.mediaLibraryGrid}>
              {selectableMedia.map((item) => {
                const url = item.previewUrl || item.url;
                const selected = profile.avatarUrl === url;
                return (
                  <button
                    key={`avatar-${item.id}`}
                    type="button"
                    className={`${ui.mediaLibraryTile} ${selected ? ui.mediaTileSelected : ""}`.trim()}
                    onClick={() => selectAvatar(url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={item.filename} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className={ui.mediaSection}>
            <div className={ui.mediaLabel}>Header image</div>
            <div className={ui.mediaPreview}>
              {profile.heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.heroUrl} alt="Header" style={{ maxHeight: 240, width: "100%" }} />
              ) : (
                <div className={ui.bigDrop}>No header image selected.</div>
              )}
            </div>
            <div className={ui.mediaLibraryGrid}>
              {selectableMedia.map((item) => {
                const url = item.previewUrl || item.url;
                const selected = profile.heroUrl === url;
                return (
                  <button
                    key={`hero-${item.id}`}
                    type="button"
                    className={`${ui.mediaLibraryTile} ${selected ? ui.mediaTileSelected : ""}`.trim()}
                    onClick={() => selectHero(url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={item.filename} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className={ui.mediaSection}>
            <div className={ui.mediaLabel}>Gallery images (up to 3)</div>
            <div className={ui.mediaGallery}>
              {profile.galleryUrls.map((url) => (
                <div key={url} className={ui.mediaGalleryItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Gallery" />
                </div>
              ))}
            </div>
            <div className={ui.mediaLibraryGrid}>
              {selectableMedia.map((item) => {
                const url = item.previewUrl || item.url;
                const selected = profile.galleryUrls.includes(url);
                return (
                  <button
                    key={`gallery-${item.id}`}
                    type="button"
                    className={`${ui.mediaLibraryTile} ${selected ? ui.mediaTileSelected : ""}`.trim()}
                    onClick={() => toggleGallery(url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={item.filename} />
                  </button>
                );
              })}
            </div>

            <div className={ui.rowActions} style={{ marginTop: 12 }}>
              <button className="btnPrimary" type="button" onClick={onSaveProfileImages} disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save profile images"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {loading === false && tab === "library" ? (
        <div className={ui.mediaSection}>
          <div className={ui.headerRow}>
            <div className={ui.mediaLabel}>Upload library</div>
            <div className={ui.rowActions}>
              <label className="btnGhost">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  disabled={uploading}
                  onChange={onUpload}
                />
                {uploading ? "Uploading..." : "Upload images"}
              </label>
              <label className={ui.inputField}>
                Kind
                <select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as MediaItem["kind"])}>
                  {kindOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {media.length === 0 ? <div className={ui.muted}>No media uploaded yet.</div> : null}
          {media.length > 0 ? (
            <div className={ui.mediaLibraryGrid}>
              {media.map((item) => (
                <div key={item.id} className={ui.mediaLibraryTile}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl || item.url} alt={item.filename} />
                  <button
                    type="button"
                    className="btnGhost"
                    style={{ position: "absolute", right: 8, top: 8 }}
                    onClick={() => void onDelete(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "..." : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
