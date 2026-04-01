"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import { requestJson } from "@/lib/client/request";
import type { ActiveTermsModule, ArtistMediaItem } from "@/lib/types";

type OnboardingFormProps = {
  initial: {
    fullName: string;
    email: string;
    city: string;
    country: string;
    bio: string;
    handle: string;
    displayName: string;
    avatarUrl: string;
    heroUrl: string;
    galleryUrls: string[];
    consents: {
      allowOriginalSales: boolean;
      allowPrintSales: boolean;
      allowRental: boolean;
      allowExhibitions: boolean;
    };
    activeTerms: ActiveTermsModule[];
  };
};

function asSingleMedia(url: string, kind: ArtistMediaItem["kind"]): ArtistMediaItem[] {
  return url ? [{ id: "", kind, url, previewUrl: url, filename: "Current image" }] : [];
}

function asGalleryMedia(urls: string[]): ArtistMediaItem[] {
  return urls.map((url, index) => ({ id: "", kind: "gallery", url, previewUrl: url, filename: `Gallery ${index + 1}` }));
}

export function OnboardingForm({ initial }: OnboardingFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState(initial.country);
  const [bio, setBio] = useState(initial.bio);
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [avatarItems, setAvatarItems] = useState<ArtistMediaItem[]>(asSingleMedia(initial.avatarUrl, "avatar"));
  const [heroItems, setHeroItems] = useState<ArtistMediaItem[]>(asSingleMedia(initial.heroUrl, "hero"));
  const [galleryItems, setGalleryItems] = useState<ArtistMediaItem[]>(asGalleryMedia(initial.galleryUrls));
  const [allowOriginalSales, setAllowOriginalSales] = useState(initial.consents.allowOriginalSales);
  const [allowPrintSales, setAllowPrintSales] = useState(initial.consents.allowPrintSales);
  const [allowRental, setAllowRental] = useState(initial.consents.allowRental);
  const [allowExhibitions, setAllowExhibitions] = useState(initial.consents.allowExhibitions);
  const [accepted, setAccepted] = useState(false);
  const [acceptedName, setAcceptedName] = useState(initial.fullName);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const { response: res, json } = await requestJson<{ ok?: boolean; error?: string; documentSlug?: string }>(
          "/api/artist/onboarding",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              personal: {
                fullName,
                city,
                country,
                bio,
              },
              profile: {
                handle,
                displayName,
                avatarUrl: avatarItems[0]?.url || "",
                heroUrl: heroItems[0]?.url || "",
                galleryUrls: galleryItems.map((item) => item.url),
              },
              consents: {
                allowOriginalSales,
                allowPrintSales,
                allowRental,
                allowExhibitions,
              },
              terms: {
                acceptedDocumentSlugs: initial.activeTerms.map((item) => item.document.slug),
                acceptedName,
                accepted,
              },
            }),
            retries: 2,
          },
        );

        if (!res.ok || !json?.ok) {
          setError(json?.error === "missing_terms_acceptance" ? `Missing acceptance for ${json.documentSlug}.` : json?.error || "Could not save onboarding.");
          return;
        }

        setSuccess("Onboarding saved.");
        router.replace("/");
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not save onboarding.");
      }
    });
  }

  return (
    <form className="space-y-8 pb-8" onSubmit={handleSubmit}>
      <PageTitle
        title="Onboarding"
        subtitle="Complete your core artist profile against the real canonical artist records before entering the workspace."
      />

      <Section title="Identity" subtitle={`Signed in as ${initial.email}`}>
        <div className="space-y-4">
          <Input label="Personal name" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={isPending} />
          <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={isPending} />
          <Input label="Handle" value={handle} onChange={(event) => setHandle(event.target.value)} disabled={isPending} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" value={city} onChange={(event) => setCity(event.target.value)} disabled={isPending} />
            <Input label="Country" value={country} onChange={(event) => setCountry(event.target.value)} disabled={isPending} />
          </div>
          <Textarea label="Bio" value={bio} onChange={(event) => setBio(event.target.value)} disabled={isPending} />
        </div>
      </Section>

      <Section title="Profile visuals" subtitle="Uploads go directly into ArtistMediaV2 and are then written into CanonicalArtist.">
        <div className="space-y-5">
          <ImageUploader label="Avatar" kind="avatar" items={avatarItems} onChange={(items) => setAvatarItems(items.slice(-1))} />
          <ImageUploader label="Header image" kind="hero" items={heroItems} onChange={(items) => setHeroItems(items.slice(-1))} />
          <ImageUploader label="Gallery images" kind="gallery" multiple items={galleryItems} onChange={setGalleryItems} />
        </div>
      </Section>

      <Section title="Consents" subtitle="These values are stored on the canonical artist profile.">
        <div className="grid gap-3">
          <CheckboxField checked={allowOriginalSales} onChange={setAllowOriginalSales} label="Allow original sales" />
          <CheckboxField checked={allowPrintSales} onChange={setAllowPrintSales} label="Allow print sales" />
          <CheckboxField checked={allowRental} onChange={setAllowRental} label="Allow rental" />
          <CheckboxField checked={allowExhibitions} onChange={setAllowExhibitions} label="Allow exhibitions" />
        </div>
      </Section>

      <Section title="Terms" subtitle="Acceptance is persisted with versioned terms records.">
        <div className="space-y-4">
          <div className="space-y-3">
            {initial.activeTerms.map((item) => (
              <div key={item.version.id} className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">
                <div className="font-medium text-neutral-900">{item.document.title}</div>
                <div>Version {item.version.version}</div>
              </div>
            ))}
          </div>
          <Input label="Accepted name" value={acceptedName} onChange={(event) => setAcceptedName(event.target.value)} disabled={isPending} />
          <CheckboxField checked={accepted} onChange={setAccepted} label="I accept the active artist terms" />
        </div>
      </Section>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : "Complete onboarding"}
      </Button>
    </form>
  );
}
