"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { MultiStepForm } from "@/components/forms/MultiStepForm";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import type { ArtistMediaItem, ArtistSeriesItem } from "@/lib/types";

type ArtworkFormProps = {
  mode: "create" | "edit";
  productKey?: string;
  initialValue?: {
    title: string;
    description: string;
    year: number | null;
    widthCm: number | null;
    heightCm: number | null;
    forSale: boolean;
    originalAvailable: boolean;
    printsEnabled: boolean;
    seriesId: string;
    printSizeCodes: string[];
    mediaItems: ArtistMediaItem[];
  };
  series: ArtistSeriesItem[];
  printSizes: Array<{ code: string; label: string }>;
};

const emptyValue = {
  title: "",
  description: "",
  year: null,
  widthCm: null,
  heightCm: null,
  forSale: true,
  originalAvailable: true,
  printsEnabled: false,
  seriesId: "",
  printSizeCodes: [] as string[],
  mediaItems: [] as ArtistMediaItem[],
};

function mapArtworkError(code: string | undefined) {
  switch (code) {
    case "print_sizes_required":
      return "Select at least one print size.";
    case "invalid_print_size":
      return "One of the selected print sizes is invalid.";
    case "invalid_media_ids":
      return "At least one selected image is invalid.";
    case "media_not_found":
      return "At least one selected image could not be found anymore.";
    case "series_not_found":
      return "The selected series could not be found.";
    case "no_variants_generated":
      return "Enable an original or at least one print size before saving.";
    case "database_unavailable":
      return "The database is currently unavailable.";
    case "database_write_forbidden":
      return "The server can read data, but is currently not allowed to write to the database.";
    case "duplicate_key_conflict":
      return "A conflicting artwork record already exists.";
    case "artwork_create_failed":
      return "The artwork could not be created due to a server-side write error.";
    case "artwork_update_failed":
      return "The artwork could not be updated due to a server-side write error.";
    default:
      return code || "Could not save artwork.";
  }
}

export function ArtworkForm({ mode, productKey, initialValue, series, printSizes }: ArtworkFormProps) {
  const router = useRouter();
  const value = initialValue || emptyValue;

  const [title, setTitle] = useState(value.title);
  const [description, setDescription] = useState(value.description);
  const [year, setYear] = useState(value.year ? String(value.year) : "");
  const [widthCm, setWidthCm] = useState(value.widthCm ? String(value.widthCm) : "");
  const [heightCm, setHeightCm] = useState(value.heightCm ? String(value.heightCm) : "");
  const [forSale, setForSale] = useState(value.forSale);
  const [originalAvailable, setOriginalAvailable] = useState(value.originalAvailable);
  const [printsEnabled, setPrintsEnabled] = useState(value.printsEnabled);
  const [seriesId, setSeriesId] = useState(value.seriesId);
  const [printSizeCodes, setPrintSizeCodes] = useState<string[]>(value.printSizeCodes);
  const [mediaItems, setMediaItems] = useState<ArtistMediaItem[]>(value.mediaItems);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  const steps = [
    { key: "images", title: "Images", description: "Upload and order the artwork images first." },
    { key: "details", title: "Basic info", description: "Add the title, description, year and optional series." },
    { key: "sales", title: "Sales options", description: "Define how the work can be sold on ARTCLUB." },
    ...(printsEnabled ? [{ key: "prints", title: "Print sizes", description: "Choose the print formats to generate canonical variants." }] : []),
    { key: "review", title: "Review", description: "Check the setup before saving the artwork." },
  ] as const;

  function currentPrintStepIndex() {
    return printsEnabled ? 3 : -1;
  }

  function reviewStepIndex() {
    return printsEnabled ? 4 : 3;
  }

  function validateStep(index: number) {
    if (index === 0 && mediaItems.length === 0) return "Upload at least one artwork image.";
    if (index === 1 && !title.trim()) return "Enter a title.";
    if (printsEnabled && index === currentPrintStepIndex() && printSizeCodes.length === 0) {
      return "Select at least one print size.";
    }
    return null;
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

  useEffect(() => {
    setStep((current) => Math.min(current, steps.length - 1));
  }, [steps.length]);

  function togglePrintSize(code: string) {
    setPrintSizeCodes((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  async function submitForm() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const endpoint = mode === "create" ? "/api/artist/artworks" : `/api/artist/artworks/${encodeURIComponent(productKey || "")}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          year: year ? Number(year) : null,
          widthCm: widthCm ? Number(widthCm) : null,
          heightCm: heightCm ? Number(heightCm) : null,
          seriesId,
          mediaIds: mediaItems.map((item) => item.id).filter(Boolean),
          forSale,
          originalAvailable,
          printsEnabled,
          printSizeCodes,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; productKey?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(mapArtworkError(json?.error));
        return;
      }

      setSuccess(mode === "create" ? "Artwork created." : "Artwork updated.");
      const nextKey = json?.productKey || productKey;
      router.replace(nextKey ? `/artworks/${encodeURIComponent(nextKey)}` : "/artworks");
      router.refresh();
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitForm();
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <PageTitle
        title={mode === "create" ? "New artwork" : "Edit artwork"}
        subtitle="Create and update canonical artwork records without writing directly to Shopify."
        action={
          <Button href="/artworks" tone="secondary">
            Back
          </Button>
        }
      />

      <MultiStepForm
        steps={steps.map((item) => ({ ...item }))}
        currentStep={step}
        onBack={goBack}
        onNext={goNext}
        onSubmit={() => void submitForm()}
        canGoBack={step > 0}
        canGoNext={!validateStep(step)}
        isLastStep={step === reviewStepIndex()}
        submitLabel={mode === "create" ? "Create artwork" : "Save artwork"}
        isSubmitting={isPending}
        footerHint={
          error ? <StatusMessage tone="error">{error}</StatusMessage> : success ? <StatusMessage tone="success">{success}</StatusMessage> : null
        }
      >
        {step === 0 ? (
          <Section title="Images" subtitle="Uploads create ArtistMediaV2 entries and link them into the artwork.">
            <ImageUploader label="Artwork images" kind="artwork" multiple items={mediaItems} onChange={setMediaItems} />
          </Section>
        ) : null}

        {step === 1 ? (
          <Section title="Core details" subtitle="Stored in CanonicalProduct.">
            <div className="space-y-4">
              <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={isPending} />
              <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={isPending} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Year" value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" disabled={isPending} />
                <Input label="Width (cm)" value={widthCm} onChange={(event) => setWidthCm(event.target.value)} inputMode="decimal" disabled={isPending} />
                <Input label="Height (cm)" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="decimal" disabled={isPending} />
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">Series</span>
                <select
                  value={seriesId}
                  onChange={(event) => setSeriesId(event.target.value)}
                  className="w-full rounded-3xl bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
                  disabled={isPending}
                >
                  <option value="">No series</option>
                  {series.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Section>
        ) : null}

        {step === 2 ? (
          <Section title="Availability" subtitle="Real canonical flags, no fake publish toggles.">
            <div className="grid gap-3">
              <CheckboxField checked={forSale} onChange={setForSale} label="Available for sale" />
              <CheckboxField checked={originalAvailable} onChange={setOriginalAvailable} label="Original available" />
              <CheckboxField checked={printsEnabled} onChange={setPrintsEnabled} label="Enable prints" />
            </div>
          </Section>
        ) : null}

        {printsEnabled && step === currentPrintStepIndex() ? (
          <Section title="Print sizes" subtitle="Canonical variants are generated from the selected print sizes.">
            <div className="grid gap-3">
              {printSizes.map((item) => (
                <CheckboxField
                  key={item.code}
                  checked={printSizeCodes.includes(item.code)}
                  onChange={() => togglePrintSize(item.code)}
                  label={item.label}
                />
              ))}
            </div>
          </Section>
        ) : null}

        {step === reviewStepIndex() ? (
          <Section title="Review" subtitle="Check the canonical artwork setup before saving.">
            <div className="space-y-4">
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                <div><span className="font-medium text-neutral-900">Title:</span> {title || "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Series:</span> {series.find((item) => item.id === seriesId)?.name || "No series"}</div>
                <div><span className="font-medium text-neutral-900">Year:</span> {year || "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Dimensions:</span> {[widthCm && `${widthCm} cm`, heightCm && `${heightCm} cm`].filter(Boolean).join(" × ") || "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Images:</span> {mediaItems.length}</div>
                <div><span className="font-medium text-neutral-900">Description:</span> {description || "No description"}</div>
              </div>
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                <div><span className="font-medium text-neutral-900">For sale:</span> {forSale ? "Yes" : "No"}</div>
                <div><span className="font-medium text-neutral-900">Original available:</span> {originalAvailable ? "Yes" : "No"}</div>
                <div><span className="font-medium text-neutral-900">Prints enabled:</span> {printsEnabled ? "Yes" : "No"}</div>
                {printsEnabled ? <div><span className="font-medium text-neutral-900">Print sizes:</span> {printSizes.filter((item) => printSizeCodes.includes(item.code)).map((item) => item.label).join(", ") || "None selected"}</div> : null}
              </div>
            </div>
          </Section>
        ) : null}
      </MultiStepForm>
    </form>
  );
}
