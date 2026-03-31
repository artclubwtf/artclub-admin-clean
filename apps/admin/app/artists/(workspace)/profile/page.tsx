"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import ui from "../workspace-ui.module.css";

type ProfilePayload = {
  ok: boolean;
  profile: {
    artistKey: string;
    email: string;
    displayName: string;
    handle: string;
    instagram: string;
    websiteUrl: string;
    locationCity: string;
    locationCountry: string;
    bio: string;
    profileImages: {
      avatarUrl: string;
      heroUrl: string;
      galleryUrls: string[];
    };
  };
};

type Artwork = {
  productKey: string;
  title: string;
  images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
};

export default function ArtistsProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);

  const [form, setForm] = useState<ProfilePayload["profile"]>({
    artistKey: "",
    email: "",
    displayName: "",
    handle: "",
    instagram: "",
    websiteUrl: "",
    locationCity: "",
    locationCountry: "",
    bio: "",
    profileImages: { avatarUrl: "", heroUrl: "", galleryUrls: [] },
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileRes, artworksRes] = await Promise.all([
          fetch("/api/artists/v3/profile", { cache: "no-store" }),
          fetch("/api/artists/v2/artworks", { cache: "no-store" }),
        ]);
        const profilePayload = (await profileRes.json().catch(() => null)) as ProfilePayload | { error?: string } | null;
        if (!profileRes.ok) throw new Error((profilePayload as { error?: string } | null)?.error || "Failed to load profile");

        const artworksPayload = (await artworksRes.json().catch(() => null)) as { artworks?: Artwork[] } | null;

        if (active) {
          setForm((profilePayload as ProfilePayload).profile);
          setArtworks(Array.isArray(artworksPayload?.artworks) ? artworksPayload?.artworks || [] : []);
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load profile");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const artworksCount = artworks.length;
    return {
      artworksCount,
      saves: 300 + artworksCount * 8,
      followers: 1000 + artworksCount * 11,
    };
  }, [artworks]);

  const featured = useMemo(() => artworks.slice(0, 3), [artworks]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artists/v3/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          handle: form.handle,
          instagram: form.instagram,
          websiteUrl: form.websiteUrl,
          locationCity: form.locationCity,
          locationCountry: form.locationCountry,
          bio: form.bio,
        }),
      });
      const payload = (await res.json().catch(() => null)) as ProfilePayload | { error?: string } | null;
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error || "Failed to save profile");
      setForm((payload as ProfilePayload).profile);
      setMessage("Profile updated.");
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const initials = (form.displayName || "AR")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      {message ? <div className={ui.success}>{message}</div> : null}
      {loading ? <div className={ui.muted}>Loading profile...</div> : null}

      {loading === false ? (
        <form className={ui.inputRow} onSubmit={onSubmit}>
          <div className={ui.pageIntro}>
            <div className={ui.pageTitle}>Your artist profile</div>
          </div>

          <div className={ui.panel}>
            <div className={ui.profileHero}>
              {form.profileImages.heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.profileImages.heroUrl} alt="Hero" />
              ) : null}
            </div>

            <div className={ui.profileAvatarRow}>
              <div className={ui.profileAvatar}>
                {form.profileImages.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.profileImages.avatarUrl} alt="Avatar" />
                ) : (
                  initials || "AR"
                )}
              </div>

              <div className={ui.profileIdentity}>
                <div className={ui.identityName}>{form.displayName || "Artist"}</div>
                <div className={ui.identityMeta}>
                  {form.locationCity || "City"}
                  {form.locationCountry ? `, ${form.locationCountry}` : ""}
                </div>
              </div>

              <div className={ui.rowActions}>
                <span className={ui.statusPill}>Active</span>
                <a className="btnGhost" href={`/${form.handle || "artist"}`} target="_blank" rel="noreferrer">
                  Preview public page
                </a>
                {editing ? (
                  <button className="btnPrimary" type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save profile"}
                  </button>
                ) : (
                  <button className="btnPrimary" type="button" onClick={() => setEditing(true)}>
                    Edit profile
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={ui.statsStrip}>
            <div className={ui.stripCell}>
              <div className={ui.stripValue}>{stats.artworksCount}</div>
              <div className={ui.stripLabel}>Artworks</div>
            </div>
            <div className={ui.stripCell}>
              <div className={ui.stripValue}>{stats.saves}</div>
              <div className={ui.stripLabel}>Saves</div>
            </div>
            <div className={ui.stripCell}>
              <div className={ui.stripValue}>{stats.followers}</div>
              <div className={ui.stripLabel}>Followers</div>
            </div>
          </div>

          <div className={ui.panel}>
            <div className={ui.headerRow}>
              <div className={ui.cardTitle}>About</div>
              {editing ? null : (
                <button className="btnGhost" type="button" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className={ui.twoCol}>
                <label className={ui.inputField}>
                  Display name
                  <input value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} />
                </label>
                <label className={ui.inputField}>
                  Handle
                  <input value={form.handle} onChange={(e) => setForm((prev) => ({ ...prev, handle: e.target.value }))} />
                </label>
                <label className={ui.inputField}>
                  City
                  <input value={form.locationCity} onChange={(e) => setForm((prev) => ({ ...prev, locationCity: e.target.value }))} />
                </label>
                <label className={ui.inputField}>
                  Country
                  <input value={form.locationCountry} onChange={(e) => setForm((prev) => ({ ...prev, locationCountry: e.target.value }))} />
                </label>
                <label className={ui.inputField}>
                  Instagram
                  <input value={form.instagram} onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))} />
                </label>
                <label className={ui.inputField}>
                  Website
                  <input value={form.websiteUrl} onChange={(e) => setForm((prev) => ({ ...prev, websiteUrl: e.target.value }))} />
                </label>
                <label className={ui.inputField} style={{ gridColumn: "1 / -1" }}>
                  Bio
                  <textarea rows={4} value={form.bio} onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))} />
                </label>
              </div>
            ) : (
              <div className={ui.cardText}>{form.bio || "No bio yet."}</div>
            )}
          </div>

          <div className={ui.panel}>
            <div className={ui.headerRow}>
              <div className={ui.cardTitle}>Featured works</div>
              <Link className="btnGhost" href="/artists/artworks">
                Manage
              </Link>
            </div>

            {featured.length === 0 ? <div className={ui.muted}>No artworks yet.</div> : null}
            {featured.length > 0 ? (
              <div className={ui.thumbRow}>
                {featured.map((item) => {
                  const image = item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl || "";
                  return (
                    <div key={item.productKey} className={ui.thumb}>
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt={item.title} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {editing ? (
            <div className={ui.rowActions}>
              <button className="btnGhost" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btnPrimary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
