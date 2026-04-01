"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { MultiStepForm } from "@/components/forms/MultiStepForm";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import {
  buildPrintPricePreview,
  generateAspectRatioPrintSizes,
  normalizePrintSizeCode,
} from "@/lib/print-pricing";
import type { ArtistMediaItem, ArtistSeriesItem } from "@/lib/types";

type ArtworkFormProps = {
  mode: "create" | "edit";
  productKey?: string;
  initialValue?: {
    title: string;
    description: string;
    year: number | null;
    originalWidthCm: number | null;
    originalHeightCm: number | null;
    originalPriceCents: number | null;
    forSale: boolean;
    originalAvailable: boolean;
    printsEnabled: boolean;
    seriesId: string;
    printSizeCodes: string[];
    mediaItems: ArtistMediaItem[];
  };
  series: ArtistSeriesItem[];
};

const emptyValue = {
  title: "",
  description: "",
  year: null,
  originalWidthCm: null,
  originalHeightCm: null,
  originalPriceCents: null,
  forSale: true,
  originalAvailable: true,
  printsEnabled: false,
  seriesId: "",
  printSizeCodes: [] as string[],
  mediaItems: [] as ArtistMediaItem[],
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, cents) / 100);
}

function parsePositiveNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseEuroToCents(value: string) {
  const amount = parsePositiveNumber(value);
  return amount ? Math.round(amount * 100) : null;
}

function mapArtworkError(code: string | undefined) {
  switch (code) {
    case "original_price_required":
      return "Add the original sale price in EUR.";
    case "invalid_original_price":
      return "The original price must be greater than zero.";
    case "original_dimensions_required":
      return "Add the original width and height in cm.";
    case "invalid_original_dimensions":
      return "The original dimensions must be positive numbers.";
    case "print_sizes_required":
      return "Select at least one print size.";
    case "invalid_print_size":
      return "One of the selected print sizes is invalid for the current artwork ratio.";
    case "invalid_print_configuration":
      return "Print prices could not be calculated from the current artwork dimensions.";
    case "invalid_print_size_selection":
      return "At least one selected print size no longer matches the artwork ratio.";
    case "invalid_media_ids":
      return "At least one selected image is invalid.";
    case "media_not_found":
      return "At least one selected image could not be found anymore.";
    case "series_not_found":
      return "The selected series could not be found.";
    case "no_variants_generated":
      return "Enable the original or at least one print size before saving.";
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

export function ArtworkForm({ mode, productKey, initialValue, series }: ArtworkFormProps) {
  const router = useRouter();
  const value = initialValue || emptyValue;

  const [title, setTitle] = useState(value.title);
  const [description, setDescription] = useState(value.description);
  const [year, setYear] = useState(value.year ? String(value.year) : "");
  const [originalWidthCm, setOriginalWidthCm] = useState(value.originalWidthCm ? String(value.originalWidthCm) : "");
  const [originalHeightCm, setOriginalHeightCm] = useState(value.originalHeightCm ? String(value.originalHeightCm) : "");
  const [originalPriceEur, setOriginalPriceEur] = useState(
    value.originalPriceCents && value.originalPriceCents > 0 ? (value.originalPriceCents / 100).toFixed(2).replace(/\.00$/, "") : "",
  );
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

  const parsedOriginalWidthCm = parsePositiveNumber(originalWidthCm);
  const parsedOriginalHeightCm = parsePositiveNumber(originalHeightCm);
  const originalPriceCents = parseEuroToCents(originalPriceEur);

  const generatedPrintSizes = useMemo(
    () =>
      generateAspectRatioPrintSizes({
        originalWidthCm: parsedOriginalWidthCm,
        originalHeightCm: parsedOriginalHeightCm,
      }),
    [parsedOriginalHeightCm, parsedOriginalWidthCm],
  );

  const printPricePreview = useMemo(
    () =>
      buildPrintPricePreview({
        originalWidthCm: parsedOriginalWidthCm,
        originalHeightCm: parsedOriginalHeightCm,
      }),
    [parsedOriginalHeightCm, parsedOriginalWidthCm],
  );

  const steps = [
    { key: "images", title: "Images", description: "Upload and order the artwork images first." },
    { key: "details", title: "Basic info", description: "Add the title, description, year and optional series." },
    { key: "sales", title: "Sales options", description: "Choose whether the original and prints are offered on ARTCLUB." },
    { key: "pricing", title: "Dimensions & pricing", description: "Set the original dimensions and the original sale price." },
    ...(printsEnabled
      ? [
          {
            key: "prints",
            title: "Print sizes",
            description: "Select the automatically generated print sizes and review finish prices.",
          },
        ]
      : []),
    { key: "review", title: "Review", description: "Check the setup before saving the artwork." },
  ] as const;

  function currentPrintStepIndex() {
    return printsEnabled ? 4 : -1;
  }

  function reviewStepIndex() {
    return printsEnabled ? 5 : 4;
  }

  useEffect(() => {
    setStep((current) => Math.min(current, steps.length - 1));
  }, [steps.length]);

  useEffect(() => {
    if (!printsEnabled) {
      setPrintSizeCodes([]);
      return;
    }

    setPrintSizeCodes((current) =>
      Array.from(
        new Set(
          current
            .map((code) =>
              normalizePrintSizeCode(code, {
                originalWidthCm: parsedOriginalWidthCm,
                originalHeightCm: parsedOriginalHeightCm,
              }),
            )
            .filter((code): code is string => Boolean(code)),
        ),
      ),
    );
  }, [generatedPrintSizes, printsEnabled]);

  function validateStep(index: number) {
    if (index === 0 && mediaItems.length === 0) return "Upload at least one artwork image.";
    if (index === 1 && !title.trim()) return "Enter a title.";
    if (index === 2 && !originalAvailable && !printsEnabled) return "Enable the original or at least one print option.";
    if (index === 3) {
      if (printsEnabled) {
        if (!parsedOriginalWidthCm || !parsedOriginalHeightCm) return "Add the original width and height in cm.";
        if (!generatedPrintSizes.length) return "The print sizes could not be calculated from the current dimensions.";
      }
      if (originalAvailable && forSale) {
        if (!originalPriceEur.trim()) return "Add the original sale price in EUR.";
        if (!originalPriceCents || originalPriceCents <= 0) return "The original price must be greater than zero.";
      }
    }
    if (printsEnabled && index === currentPrintStepIndex()) {
      if (!generatedPrintSizes.length) return "The print sizes could not be calculated from the current dimensions.";
      if (printSizeCodes.length === 0) return "Select at least one print size.";
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
          originalWidthCm: parsedOriginalWidthCm,
          originalHeightCm: parsedOriginalHeightCm,
          originalPriceEur: originalPriceEur.trim() ? Number(originalPriceEur.replace(",", ".")) : null,
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
          <Section title="Core details" subtitle="Stored on the canonical product record.">
            <div className="space-y-4">
              <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={isPending} />
              <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={isPending} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Year" value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" disabled={isPending} />
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
            </div>
          </Section>
        ) : null}

        {step === 2 ? (
          <Section title="Availability" subtitle="Choose what ARTCLUB should offer for this artwork.">
            <div className="space-y-4">
              <div className="grid gap-3">
                <CheckboxField checked={forSale} onChange={setForSale} label="Available for sale on ARTCLUB" />
                <CheckboxField checked={originalAvailable} onChange={setOriginalAvailable} label="Offer the original" />
                <CheckboxField checked={printsEnabled} onChange={setPrintsEnabled} label="Offer prints" />
              </div>
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-500">
                Original price is the sale price of the unique work. Print sizes are generated automatically from the artwork ratio.
              </div>
            </div>
          </Section>
        ) : null}

        {step === 3 ? (
          <Section title="Dimensions & pricing" subtitle="Use the original dimensions as the base for print sizes and enter the original sale price in EUR.">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Original width (cm)"
                  value={originalWidthCm}
                  onChange={(event) => setOriginalWidthCm(event.target.value)}
                  inputMode="decimal"
                  disabled={isPending}
                />
                <Input
                  label="Original height (cm)"
                  value={originalHeightCm}
                  onChange={(event) => setOriginalHeightCm(event.target.value)}
                  inputMode="decimal"
                  disabled={isPending}
                />
              </div>
              <Input
                label="Original price (EUR)"
                value={originalPriceEur}
                onChange={(event) => setOriginalPriceEur(event.target.value)}
                inputMode="decimal"
                disabled={isPending || !originalAvailable}
              />
              <div className="space-y-2 text-sm leading-6 text-neutral-500">
                <p>Original dimensions are required as soon as prints are enabled.</p>
                <p>When the original is offered for sale, the original price is required.</p>
              </div>
            </div>
          </Section>
        ) : null}

        {printsEnabled && step === currentPrintStepIndex() ? (
          <Section title="Print sizes & prices" subtitle="Print sizes follow the artwork ratio automatically. Select the sizes you want to offer.">
            <div className="space-y-4">
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-500">
                Print prices are calculated automatically per finish. Only ratio-correct sizes are shown.
              </div>
              <div className="grid gap-3">
                {generatedPrintSizes.map((item) => (
                  <CheckboxField
                    key={item.code}
                    checked={printSizeCodes.includes(item.code)}
                    onChange={() => togglePrintSize(item.code)}
                    label={item.label}
                  />
                ))}
              </div>
              <div className="space-y-3">
                {printPricePreview.map((size) => (
                  <div key={size.code} className="rounded-[1.75rem] bg-neutral-50 px-4 py-4">
                    <div className="text-sm font-medium tracking-[-0.01em] text-neutral-950">{size.label}</div>
                    <div className="mt-3 space-y-2 text-sm text-neutral-600">
                      {size.finishes.map((finish) => (
                        <div key={finish.code} className="flex items-center justify-between gap-4">
                          <span>{finish.label}</span>
                          <span className="text-neutral-950">{formatCurrency(finish.priceCents)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                <div>
                  <span className="font-medium text-neutral-900">Original dimensions:</span>{" "}
                  {[originalWidthCm && `${originalWidthCm} cm`, originalHeightCm && `${originalHeightCm} cm`].filter(Boolean).join(" × ") || "Not set"}
                </div>
                <div><span className="font-medium text-neutral-900">Images:</span> {mediaItems.length}</div>
                <div><span className="font-medium text-neutral-900">Description:</span> {description || "No description"}</div>
              </div>
              <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                <div><span className="font-medium text-neutral-900">For sale:</span> {forSale ? "Yes" : "No"}</div>
                <div><span className="font-medium text-neutral-900">Original available:</span> {originalAvailable ? "Yes" : "No"}</div>
                <div><span className="font-medium text-neutral-900">Original price:</span> {originalPriceCents ? formatCurrency(originalPriceCents) : "Not set"}</div>
                <div><span className="font-medium text-neutral-900">Prints enabled:</span> {printsEnabled ? "Yes" : "No"}</div>
                {printsEnabled ? (
                  <div>
                    <span className="font-medium text-neutral-900">Selected print sizes:</span>{" "}
                    {generatedPrintSizes.filter((item) => printSizeCodes.includes(item.code)).map((item) => item.label).join(", ") || "None selected"}
                  </div>
                ) : null}
              </div>
              {printsEnabled && printPricePreview.length ? (
                <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                  <div className="font-medium text-neutral-900">Generated print variants</div>
                  {printPricePreview
                    .filter((size) => printSizeCodes.includes(size.code))
                    .map((size) => (
                      <div key={size.code} className="mt-3 space-y-1">
                        <div className="text-neutral-900">{size.label}</div>
                        {size.finishes.map((finish) => (
                          <div key={finish.code}>
                            {finish.label}: {formatCurrency(finish.priceCents)}
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}
      </MultiStepForm>
    </form>
  );
}
