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
  const [isPending, startTransition] = useTransition();

  function togglePrintSize(code: string) {
    setPrintSizeCodes((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        setError(json?.error || "Could not save artwork.");
        return;
      }

      setSuccess(mode === "create" ? "Artwork created." : "Artwork updated.");
      const nextKey = json?.productKey || productKey;
      router.replace(nextKey ? `/artworks/${encodeURIComponent(nextKey)}` : "/artworks");
      router.refresh();
    });
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

      <Section title="Images" subtitle="Uploads create ArtistMediaV2 entries and link them into the artwork.">
        <ImageUploader label="Artwork images" kind="artwork" multiple items={mediaItems} onChange={setMediaItems} />
      </Section>

      <Section title="Availability" subtitle="Real canonical flags, no fake publish toggles.">
        <div className="grid gap-3">
          <CheckboxField checked={forSale} onChange={setForSale} label="Available for sale" />
          <CheckboxField checked={originalAvailable} onChange={setOriginalAvailable} label="Original available" />
          <CheckboxField checked={printsEnabled} onChange={setPrintsEnabled} label="Enable prints" />
        </div>
      </Section>

      {printsEnabled ? (
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

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : mode === "create" ? "Create artwork" : "Save artwork"}
      </Button>
    </form>
  );
}
