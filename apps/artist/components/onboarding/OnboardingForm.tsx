"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { MultiStepForm } from "@/components/forms/MultiStepForm";
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
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  const steps = [
    { key: "identity", title: "Basic info", description: "Set the public identity and location details for your artist profile." },
    { key: "visuals", title: "Visuals", description: "Upload the profile images that will shape the public artist page." },
    { key: "consents", title: "Consents", description: "Confirm what ARTCLUB is allowed to do with your work." },
    { key: "legal", title: "Legal", description: "Accept the active artist terms with your name." },
    { key: "review", title: "Review", description: "Double-check the profile before completing onboarding." },
  ] as const;

  function validateStep(index: number) {
    switch (index) {
      case 0:
        if (!fullName.trim()) return "Enter your personal name.";
        if (!displayName.trim()) return "Enter your display name.";
        if (!handle.trim()) return "Enter a handle.";
        return null;
      case 3:
        if (!acceptedName.trim()) return "Enter the accepted name.";
        if (!accepted) return "Accept the active artist terms before continuing.";
        return null;
      default:
        return null;
    }
  }

  function goNext() {
    const nextError = validateStep(step);
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submitForm() {
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitForm();
  }

  return (
    <form className="space-y-8 pb-8" onSubmit={handleSubmit}>
      <PageTitle
        title="Onboarding"
        subtitle="Complete your core artist profile against the real canonical artist records before entering the workspace."
      />

      <MultiStepForm
        steps={steps.map((item) => ({ ...item }))}
        currentStep={step}
        onBack={goBack}
        onNext={goNext}
        onSubmit={() => void submitForm()}
        canGoBack={step > 0}
        canGoNext={!validateStep(step)}
        isLastStep={step === steps.length - 1}
        submitLabel="Complete onboarding"
        isSubmitting={isPending}
        footerHint={
          error ? <StatusMessage tone="error">{error}</StatusMessage> : success ? <StatusMessage tone="success">{success}</StatusMessage> : null
        }
      >
        {step === 0 ? (
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
        ) : null}

        {step === 1 ? (
          <Section title="Profile visuals" subtitle="Uploads go directly into ArtistMediaV2 and are then written into CanonicalArtist.">
            <div className="space-y-5">
              <ImageUploader label="Avatar" kind="avatar" items={avatarItems} onChange={(items) => setAvatarItems(items.slice(-1))} />
              <ImageUploader label="Header image" kind="hero" items={heroItems} onChange={(items) => setHeroItems(items.slice(-1))} />
              <ImageUploader label="Gallery images" kind="gallery" multiple items={galleryItems} onChange={setGalleryItems} />
            </div>
          </Section>
        ) : null}

        {step === 2 ? (
          <Section title="Consents" subtitle="These values are stored on the canonical artist profile.">
            <div className="grid gap-3">
              <CheckboxField checked={allowOriginalSales} onChange={setAllowOriginalSales} label="Allow original sales" />
              <CheckboxField checked={allowPrintSales} onChange={setAllowPrintSales} label="Allow print sales" />
              <CheckboxField checked={allowRental} onChange={setAllowRental} label="Allow rental" />
              <CheckboxField checked={allowExhibitions} onChange={setAllowExhibitions} label="Allow exhibitions" />
            </div>
          </Section>
        ) : null}

        {step === 3 ? (
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
        ) : null}

        {step === 4 ? (
          <Section title="Review" subtitle="Check the core setup before entering the artist workspace.">
            <div className="space-y-4">
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                <div><span className="font-medium text-neutral-900">Display name:</span> {displayName || "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Handle:</span> {handle || "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Location:</span> {[city, country].filter(Boolean).join(", ") || "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Bio:</span> {bio || "No bio yet"}</div>
                <div><span className="font-medium text-neutral-900">Avatar:</span> {avatarItems.length ? "Uploaded" : "Not uploaded"}</div>
                <div><span className="font-medium text-neutral-900">Header:</span> {heroItems.length ? "Uploaded" : "Not uploaded"}</div>
                <div><span className="font-medium text-neutral-900">Gallery:</span> {galleryItems.length} image{galleryItems.length === 1 ? "" : "s"}</div>
              </div>
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                <div className="font-medium text-neutral-900">Selected consents</div>
                <div>{allowOriginalSales ? "Original sales enabled" : "Original sales disabled"}</div>
                <div>{allowPrintSales ? "Print sales enabled" : "Print sales disabled"}</div>
                <div>{allowRental ? "Rental enabled" : "Rental disabled"}</div>
                <div>{allowExhibitions ? "Exhibitions enabled" : "Exhibitions disabled"}</div>
                <div>{accepted ? `Terms accepted as ${acceptedName || "Unnamed"}` : "Terms not accepted yet"}</div>
              </div>
            </div>
          </Section>
        ) : null}
      </MultiStepForm>
    </form>
  );
}
