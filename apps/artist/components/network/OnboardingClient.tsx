"use client";

import { createNetworkApiClient } from "@artclub/api-client";
import { FormEvent, useRef, useState } from "react";

import { ImageUpload, type ImageUploadItem } from "@/components/forms/ImageUpload";

const api = createNetworkApiClient();
const labels: Record<string, string> = { artist: "Artist profile", art_enthusiast: "Collector / Art Enthusiast profile", gallery: "Gallery profile", event_series: "Event Organizer profile", curator: "Curator profile", institution: "Institution profile" };

export function OnboardingClient({ email, profileType, initial }: { email: string; profileType: string; initial?: any }) {
  const [value, setValue] = useState({ displayName: initial?.displayName || "", username: initial?.username || email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").toLowerCase(), city: initial?.city || "", country: initial?.country || "", disciplines: (initial?.disciplines || []).join(", "), interests: (initial?.interests || []).join(", "), bio: initial?.bio || "", website: initial?.website || "", instagram: initial?.instagram || "", profileImageUrl: initial?.profileImageUrl || "", coverImageUrl: initial?.coverImageUrl || "", isPublic: initial?.isPublic !== false, allowsMessages: initial?.allowsMessages === true, donationEnabled: initial?.donationEnabled === true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const submitting = useRef(false);
  const avatarItems: ImageUploadItem[] = value.profileImageUrl ? [{ url: value.profileImageUrl }] : [];
  const coverItems: ImageUploadItem[] = value.coverImageUrl ? [{ url: value.coverImageUrl }] : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || uploadBusy) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api.request("/profile", { method: "POST", body: JSON.stringify({ ...value, profileType, disciplines: value.disciplines.split(",").map((item: string) => item.trim()).filter(Boolean), interests: value.interests.split(",").map((item: string) => item.trim()).filter(Boolean) }) });
      location.href = "/feed";
    } catch {
      submitting.current = false;
      setBusy(false);
      setError("Your profile could not be completed. Please check the fields and try again.");
    }
  }

  const field = (key: keyof typeof value, label: string, required = false, type = "text") => <label className="block"><span className="mb-1 block text-sm">{label}</span><input required={required} disabled={busy || uploadBusy} type={type} value={String(value[key] || "")} onChange={event => setValue({ ...value, [key]: event.target.value })} className="control w-full disabled:opacity-60" /></label>;
  const showDisciplines = profileType === "artist";
  const showInterests = profileType === "art_enthusiast";
  const showWebsite = ["gallery", "event_series", "curator", "institution"].includes(profileType);

  return <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 px-5 py-10"><p className="eyebrow">{labels[profileType] || "Complete profile"}</p><h1 className="page-heading">Complete your art-world identity</h1>{field("displayName", profileType === "gallery" ? "Gallery name" : profileType === "event_series" ? "Event series or organization" : profileType === "artist" ? "Artist name" : "Name", true)}{field("username", "Profile username", true)}{field("city", profileType === "gallery" ? "Location / City" : "City")}{field("country", "Country")}{showDisciplines && field("disciplines", "Disciplines (comma separated)")}{showInterests && field("interests", "Interests (comma separated)")}<label className="block"><span className="mb-1 block text-sm">{profileType === "event_series" || profileType === "gallery" ? "Description" : "Bio"}</span><textarea disabled={busy || uploadBusy} value={value.bio} onChange={event => setValue({ ...value, bio: event.target.value })} className="control w-full" rows={5} /></label>{showWebsite && field("website", "Website", false, "url")}{profileType === "event_series" && field("instagram", "Instagram")}<ImageUpload label="Profile image" variant="avatar" items={avatarItems} onChange={items => setValue(current => ({ ...current, profileImageUrl: items[0]?.url || "" }))} onUploadingChange={setUploadBusy} disabled={busy} /><ImageUpload label="Cover image" variant="profile-cover" items={coverItems} onChange={items => setValue(current => ({ ...current, coverImageUrl: items[0]?.url || "" }))} onUploadingChange={setUploadBusy} disabled={busy} />{error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}<button type="submit" disabled={busy || uploadBusy} className="primary-action w-full disabled:opacity-50">{uploadBusy ? "Uploading image…" : busy ? "Saving profile…" : "Finish profile"}</button></form>;
}
