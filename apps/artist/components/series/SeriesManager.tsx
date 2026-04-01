"use client";

import { useMemo, useState } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import type { ArtistSeriesItem } from "@/lib/types";

type SeriesManagerProps = {
  initialSeries: Array<ArtistSeriesItem & { artworkCount: number }>;
};

export function SeriesManager({ initialSeries }: SeriesManagerProps) {
  const [series, setSeries] = useState(initialSeries);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const sortedSeries = useMemo(() => [...series].sort((a, b) => a.name.localeCompare(b.name)), [series]);

  async function createSeries(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const res = await fetch("/api/artist/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createName, description: createDescription }),
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
    };
    setSeries((current) => [createdSeries, ...current]);
    setCreateName("");
    setCreateDescription("");
    setStatus({ tone: "success", text: "Series created." });
  }

  async function updateSeries(item: ArtistSeriesItem & { artworkCount: number }) {
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

    const updatedSeries = {
      id: json.series.id,
      name: json.series.name,
      description: json.series.description,
      coverImageUrl: json.series.coverImageUrl,
      createdAt: json.series.createdAt,
      updatedAt: json.series.updatedAt,
    };

    setSeries((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              ...updatedSeries,
            }
          : entry
      )
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
          <Button type="submit">Create series</Button>
        </form>
      </Section>

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      <Section title="Existing series" subtitle={`${sortedSeries.length} series`}>
        <div className="space-y-4">
          {sortedSeries.length ? (
            sortedSeries.map((item) => (
              <SeriesRow key={item.id} item={item} onSave={updateSeries} onDelete={deleteSeries} />
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
  onSave,
  onDelete,
}: {
  item: ArtistSeriesItem & { artworkCount: number };
  onSave: (item: ArtistSeriesItem & { artworkCount: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);

  return (
    <div className="space-y-4 rounded-[1.75rem] bg-neutral-50 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">{draft.artworkCount} artworks</div>
      <Input label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <Textarea label="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
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
