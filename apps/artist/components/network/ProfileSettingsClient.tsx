"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import { FormEvent, useRef, useState } from "react";

import { ImageUpload, type ImageUploadItem } from "@/components/forms/ImageUpload";

const api = createNetworkApiClient();
const accountTypes = [["artist", "Artist"], ["art_enthusiast", "Collector / Art Enthusiast"], ["gallery", "Gallery"], ["event_series", "Event Organizer"], ["curator", "Curator"], ["institution", "Institution"]];

export function ProfileSettingsClient({ initial }: { initial: any }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const submitting = useRef(false);
  const fixedArtist = value.profileTypeSource === "existing_artist_link";
  const avatarItems: ImageUploadItem[] = value.profileImageUrl ? [{ url: value.profileImageUrl }] : [];
  const coverItems: ImageUploadItem[] = value.coverImageUrl ? [{ url: value.coverImageUrl }] : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || uploadBusy) return;
    submitting.current = true;
    setStatus("Saving…");
    try {
      const body = { profileType: value.profileType, displayName: value.displayName, username: value.username, bio: value.bio, city: value.city, country: value.country, disciplines: String(value.disciplines || "").split(",").map(item => item.trim()).filter(Boolean), interests: String(value.interests || "").split(",").map(item => item.trim()).filter(Boolean), website: value.website, instagram: value.instagram, profileImageUrl: value.profileImageUrl, coverImageUrl: value.coverImageUrl, isPublic: value.isPublic };
      const data = await api.request<any>("/profile", { method: "PATCH", body: JSON.stringify(body) });
      if (data.next) { location.href = data.next; return; }
      setValue({ ...data.profile, disciplines: data.profile.disciplines.join(", "), interests: data.profile.interests.join(", ") });
      setStatus("Saved");
    } catch {
      setStatus("The profile could not be saved.");
    } finally {
      submitting.current = false;
    }
  }

  const field = (key: string, label: string) => <label className="block"><span className="mb-2 block text-sm font-medium">{label}</span><input disabled={uploadBusy} value={value[key] || ""} onChange={event => setValue({ ...value, [key]: event.target.value })} className="control w-full" /></label>;
  return <form onSubmit={submit} className="app-page max-w-3xl"><header><h1 className="page-heading">Profile settings</h1><p className="meta-text mt-2">Update how your identity appears across ARTCLUB Network.</p></header><div className="mt-10 space-y-10"><section className="space-y-5"><h2 className="eyebrow">Account</h2><label className="block"><span className="mb-2 block text-sm font-medium">Account type</span><select disabled={fixedArtist || uploadBusy} value={value.profileType} onChange={event => setValue({ ...value, profileType: event.target.value })} className="control w-full disabled:opacity-60">{accountTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{fixedArtist && <span className="meta-text mt-2 block">Confirmed by your linked Artist account.</span>}</label>{field("displayName", "Display name")}{field("username", "Username")}</section><section className="space-y-5"><h2 className="eyebrow">About</h2><div className="grid gap-5 sm:grid-cols-2">{field("city", "City")}{field("country", "Country")}</div><label className="block"><span className="mb-2 block text-sm font-medium">Bio</span><textarea disabled={uploadBusy} value={value.bio || ""} onChange={event => setValue({ ...value, bio: event.target.value })} rows={6} className="control w-full resize-y" /></label>{field("disciplines", "Disciplines (comma separated)")}{field("interests", "Interests (comma separated)")}</section><section className="space-y-5"><h2 className="eyebrow">Links & media</h2>{field("website", "Website")}{field("instagram", "Instagram")}<ImageUpload label="Profile image" variant="avatar" items={avatarItems} onChange={items => setValue((current: any) => ({ ...current, profileImageUrl: items[0]?.url || "" }))} onUploadingChange={setUploadBusy} /><ImageUpload label="Cover image" variant="profile-cover" items={coverItems} onChange={items => setValue((current: any) => ({ ...current, coverImageUrl: items[0]?.url || "" }))} onUploadingChange={setUploadBusy} /></section><label className="list-row"><span className="flex-1 font-medium">Public profile</span><input type="checkbox" disabled={uploadBusy} checked={value.isPublic !== false} onChange={event => setValue({ ...value, isPublic: event.target.checked })} /></label><div className="flex items-center gap-4"><button disabled={uploadBusy} className="primary-action disabled:opacity-40">{uploadBusy ? "Uploading…" : "Save changes"}</button><span className="meta-text">{status}</span></div></div></form>;
}
