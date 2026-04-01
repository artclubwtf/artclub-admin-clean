"use client";

import { useState } from "react";

import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import { asSingleMedia } from "@/components/profile/section-utils";
import type { ArtistMediaItem, ArtistSeriesItem } from "@/lib/types";

type SeriesManagerProps = {
  initialSeries: Array<ArtistSeriesItem & { artworkCount: number }>;
  artworks: Array<{
    productKey: string;
    title: string;
    imageUrl: string;
    assignedSeriesId: string;
  }>;
};

export function SeriesManager({ initialSeries, artworks: initialArtworks }: SeriesManagerProps) {
  const [series, setSeries] = useState(initialSeries);
  const [artworks, setArtworks] = useState(initialArtworks);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createCoverItems, setCreateCoverItems] = useState<ArtistMediaItem[]>([]);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function createSeries(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const res = await fetch("/api/artist/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createName, description: createDescription, coverImageUrl: createCoverItems[0]?.url || "" }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; series?: ArtistSeriesItem } | null;
    if (!res.ok || !json?.series) {
      setStatus({ tone: "error", text: json?.error || "Could not create series." });
      return;
    }

    const createdSeries: ArtistSeriesItem & { artworkCount: number } = {
      id: json.series.id,
      name: json.series.name,
      description: json.series.description,
      coverImageUrl: json.series.coverImageUrl,
      createdAt: json.series.createdAt,
      updatedAt: json.series.updatedAt,
      artworkCount: 0,
      artworkProductKeys: [],
    };
    setSeries((current) => [createdSeries, ...current]);
    setCreateName("");
    setCreateDescription("");
    setCreateCoverItems([]);
    setStatus({ tone: "success", text: "Series created." });
  }

  async function updateSeries(item: ArtistSeriesItem & { artworkCount: number; artworkProductKeys?: string[] }) {
    const res = await fetch(`/api/artist/series/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        description: item.description,
        coverImageUrl: item.coverImageUrl,
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; series?: ArtistSeriesItem } | null;
    if (!res.ok || !json?.series) {
      setStatus({ tone: "error", text: json?.error || "Could not update series." });
      return;
    }

    const assignRes = await fetch(`/api/artist/series/${encodeURIComponent(item.id)}/artworks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKeys: item.artworkProductKeys || [] }),
    });
    const assignJson = (await assignRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!assignRes.ok || !assignJson?.ok) {
      setStatus({ tone: "error", text: assignJson?.error || "Could not assign artworks." });
      return;
    }

    const updatedSeries = {
      id: json.series.id,
      name: json.series.name,
      description: json.series.description,
      coverImageUrl: json.series.coverImageUrl,
      createdAt: json.series.createdAt,
      updatedAt: json.series.updatedAt,
      artworkCount: item.artworkProductKeys?.length || 0,
      artworkProductKeys: item.artworkProductKeys || [],
    };

    setSeries((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...updatedSeries } : entry)));
    setArtworks((current) =>
      current.map((artwork) => {
        if (item.artworkProductKeys?.includes(artwork.productKey)) {
          return { ...artwork, assignedSeriesId: item.id };
        }
        if (artwork.assignedSeriesId === item.id) {
          return { ...artwork, assignedSeriesId: "" };
        }
        return artwork;
      }),
    );
    setStatus({ tone: "success", text: "Series updated." });
  }

  async function deleteSeries(id: string) {
    const res = await fetch(`/api/artist/series/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete series." });
      return;
    }

    setSeries((current) => current.filter((entry) => entry.id !== id));
    setArtworks((current) => current.map((artwork) => (artwork.assignedSeriesId === id ? { ...artwork, assignedSeriesId: "" } : artwork)));
    setStatus({ tone: "success", text: "Series deleted." });
  }

  return (
    <div className="space-y-8">
      <PageTitle
        title="Series"
        subtitle="ArtistSeries is the real source for grouped bodies of work. Artwork assignment happens on the artwork forms."
      />

      <Section title="New series" subtitle="Create a series record for the current artist.">
        <form className="space-y-4" onSubmit={createSeries}>
          <Input label="Name" value={createName} onChange={(event) => setCreateName(event.target.value)} />
          <Textarea label="Description" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} />
          <ImageUploader label="Cover image" kind="other" items={createCoverItems} onChange={(items) => setCreateCoverItems(items.slice(-1))} />
          <Button type="submit">Create series</Button>
        </form>
      </Section>

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      <Section title="Existing series" subtitle={`${series.length} series`}>
        <div className="space-y-4">
          {series.length ? (
            series.map((item) => (
              <SeriesRow key={item.id} item={item} artworks={artworks} onSave={updateSeries} onDelete={deleteSeries} />
            ))
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No series yet.</div>
          )}
        </div>
      </Section>
    </div>
  );
}

function SeriesRow({
  item,
  artworks,
  onSave,
  onDelete,
}: {
  item: ArtistSeriesItem & { artworkCount: number; artworkProductKeys?: string[] };
  artworks: Array<{ productKey: string; title: string; imageUrl: string; assignedSeriesId: string }>;
  onSave: (item: ArtistSeriesItem & { artworkCount: number; artworkProductKeys?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);
  const coverItems = asSingleMedia(draft.coverImageUrl, "other", "Cover image");

  return (
    <div className="space-y-4 rounded-[1.75rem] bg-neutral-50 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">{draft.artworkCount} artworks</div>
      <Input label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <Textarea label="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      <ImageUploader
        label="Cover image"
        kind="other"
        items={coverItems}
        onChange={(items) => setDraft({ ...draft, coverImageUrl: items[0]?.url || "" })}
      />
      <div className="space-y-3">
        <div className="text-sm font-medium tracking-[-0.01em] text-neutral-700">Artworks</div>
        <div className="space-y-2">
          {artworks.length ? (
            artworks.map((artwork) => {
              const checked = draft.artworkProductKeys?.includes(artwork.productKey) || false;
              const assignedElsewhere = artwork.assignedSeriesId && artwork.assignedSeriesId !== draft.id;
              return (
                <label key={artwork.productKey} className="flex items-center gap-3 rounded-[1.25rem] bg-white px-3 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-neutral-950"
                    checked={checked}
                    disabled={Boolean(assignedElsewhere)}
                    onChange={(event) =>
                      setDraft((current) => {
                        const currentKeys = current.artworkProductKeys || [];
                        return {
                          ...current,
                          artworkProductKeys: event.target.checked
                            ? [...currentKeys, artwork.productKey]
                            : currentKeys.filter((key) => key !== artwork.productKey),
                          artworkCount: event.target.checked
                            ? [...currentKeys, artwork.productKey].length
                            : currentKeys.filter((key) => key !== artwork.productKey).length,
                        };
                      })
                    }
                  />
                  {artwork.imageUrl ? (
                    <div className="h-10 w-10 overflow-hidden rounded-[0.9rem] bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artwork.imageUrl} alt={artwork.title} className="h-full w-full object-cover" />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-950">{artwork.title}</div>
                    {assignedElsewhere ? <div className="text-xs text-neutral-400">Assigned to another series</div> : null}
                  </div>
                </label>
              );
            })
          ) : (
            <div className="text-sm text-neutral-500">No artworks available yet.</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void onSave(draft)}>
          Save
        </Button>
        <Button type="button" tone="ghost" onClick={() => void onDelete(draft.id)}>
          Delete
        </Button>
      </div>
    </div>
  );
}
