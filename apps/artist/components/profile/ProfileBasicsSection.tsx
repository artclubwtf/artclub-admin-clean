"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Section } from "@/components/primitives/Section";
import { requestJson } from "@/lib/client/request";
import type { ArtistMediaItem, ArtistProfileData } from "@/lib/types";
import { asSingleMedia } from "@/components/profile/section-utils";

type ProfileBasicsSectionProps = {
  initialProfile: ArtistProfileData;
};

function asGalleryMedia(urls: string[]): ArtistMediaItem[] {
  return urls.map((url, index) => ({ id: "", kind: "gallery", url, previewUrl: url, filename: `Gallery ${index + 1}` }));
}

export function ProfileBasicsSection({ initialProfile }: ProfileBasicsSectionProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [handle, setHandle] = useState(initialProfile.handle);
  const [locationCity, setLocationCity] = useState(initialProfile.locationCity);
  const [locationCountry, setLocationCountry] = useState(initialProfile.locationCountry);
  const [bio, setBio] = useState(initialProfile.bio);
  const [publicProfileVisible, setPublicProfileVisible] = useState(initialProfile.publicProfileVisible);
  const [avatarItems, setAvatarItems] = useState<ArtistMediaItem[]>(asSingleMedia(initialProfile.profileImages.avatarUrl, "avatar"));
  const [heroItems, setHeroItems] = useState<ArtistMediaItem[]>(asSingleMedia(initialProfile.profileImages.heroUrl, "hero"));
  const [galleryItems, setGalleryItems] = useState<ArtistMediaItem[]>(asGalleryMedia(initialProfile.profileImages.galleryUrls));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const { response: res, json } = await requestJson<{ ok?: boolean; error?: string }>("/api/artist/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName,
            handle,
            locationCity,
            locationCountry,
            bio,
            publicProfileVisible,
            avatarUrl: avatarItems[0]?.url || "",
            heroUrl: heroItems[0]?.url || "",
            galleryUrls: galleryItems.map((item) => item.url),
          }),
          retries: 2,
        });
        if (!res.ok || !json?.ok) {
          setError(json?.error || "Could not save profile.");
          return;
        }

        setSuccess("Profile saved.");
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not save profile.");
      }
    });
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <Section title="Basic profile" subtitle={initialProfile.email}>
        <div className="space-y-4">
          <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={isPending} />
          <Input label="Handle" value={handle} onChange={(event) => setHandle(event.target.value)} disabled={isPending} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" value={locationCity} onChange={(event) => setLocationCity(event.target.value)} disabled={isPending} />
            <Input label="Country" value={locationCountry} onChange={(event) => setLocationCountry(event.target.value)} disabled={isPending} />
          </div>
          <Textarea label="About" value={bio} onChange={(event) => setBio(event.target.value)} disabled={isPending} />
          <label className="flex items-center gap-3 rounded-[1.75rem] bg-neutral-50 px-4 py-4">
            <input
              type="checkbox"
              className="h-4 w-4 accent-neutral-950"
              checked={publicProfileVisible}
              onChange={(event) => setPublicProfileVisible(event.target.checked)}
              disabled={isPending}
            />
            <span className="text-sm text-neutral-700">Public profile visible</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button href={`/artist/${encodeURIComponent(handle)}`} tone="secondary">
              Preview public page
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Visuals" subtitle="Uploads create real ArtistMediaV2 entries and update the canonical profile.">
        <div className="space-y-5">
          <ImageUploader label="Avatar" kind="avatar" items={avatarItems} onChange={(items) => setAvatarItems(items.slice(-1))} />
          <ImageUploader label="Header image" kind="hero" items={heroItems} onChange={(items) => setHeroItems(items.slice(-1))} />
          <ImageUploader label="Gallery images" kind="gallery" multiple items={galleryItems} onChange={setGalleryItems} />
        </div>
      </Section>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save basics"}
      </Button>
    </form>
  );
}
