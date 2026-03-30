"use client";

import { FormEvent, useEffect, useState } from "react";

import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

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

export default function ArtistsProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        const res = await fetch("/api/artists/v3/profile", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as ProfilePayload | { error?: string } | null;
        if (!res.ok) {
          throw new Error((payload as { error?: string } | null)?.error || "Failed to load profile");
        }
        if (active) setForm((payload as ProfilePayload).profile);
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
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Profile" subtitle="LinkedIn-style profile sections with quick edits">
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading profile…</div> : null}

      {!loading ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <SectionCard title="Header" subtitle="Identity and public metadata">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Display name
                <input value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} />
              </label>
              <label className="field">
                Handle
                <input value={form.handle} onChange={(e) => setForm((prev) => ({ ...prev, handle: e.target.value }))} />
              </label>
              <label className="field">
                City
                <input value={form.locationCity} onChange={(e) => setForm((prev) => ({ ...prev, locationCity: e.target.value }))} />
              </label>
              <label className="field">
                Country
                <input value={form.locationCountry} onChange={(e) => setForm((prev) => ({ ...prev, locationCountry: e.target.value }))} />
              </label>
            </div>
          </SectionCard>

          <SectionCard title="About" subtitle="Public biography">
            <label className="field">
              Bio
              <textarea rows={6} value={form.bio} onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))} />
            </label>
          </SectionCard>

          <SectionCard title="Links" subtitle="Optional social and website links">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">
                Instagram
                <input value={form.instagram} onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))} />
              </label>
              <label className="field">
                Website
                <input value={form.websiteUrl} onChange={(e) => setForm((prev) => ({ ...prev, websiteUrl: e.target.value }))} />
              </label>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button className="btnPrimary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
      ) : null}
    </PageShell>
  );
}
