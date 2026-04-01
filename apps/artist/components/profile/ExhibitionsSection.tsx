"use client";

import { useState } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Section } from "@/components/primitives/Section";
import { asSingleMedia, formatDateRange, isUpcomingOrOngoingDateRange, moveItem, toReorderIds } from "@/components/profile/section-utils";
import type { ArtistExhibitionItem, ArtistMediaItem } from "@/lib/types";

type ExhibitionsSectionProps = {
  initialItems: ArtistExhibitionItem[];
  onItemsChange?: (items: ArtistExhibitionItem[]) => void;
  initialOpenCreate?: boolean;
};

const emptyItem: ArtistExhibitionItem = {
  id: "",
  title: "",
  venue: "",
  exhibitionType: "other",
  city: "",
  country: "",
  startDate: "",
  endDate: "",
  isOngoing: false,
  description: "",
  link: "",
  coverImageUrl: "",
  sortOrder: 0,
  visibility: "public",
};

function toExhibitionPayload(item: ArtistExhibitionItem) {
  return {
    title: item.title,
    venue: item.venue,
    exhibitionType: item.exhibitionType,
    city: item.city,
    country: item.country,
    startDate: item.startDate,
    endDate: item.endDate,
    isOngoing: item.isOngoing,
    description: item.description,
    link: item.link,
    coverImageUrl: item.coverImageUrl,
    visibility: item.visibility,
  };
}

export function ExhibitionsSection({ initialItems, onItemsChange, initialOpenCreate = false }: ExhibitionsSectionProps) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(initialOpenCreate ? "__new__" : null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const upcoming = items.filter((item) => isUpcomingOrOngoingDateRange(item));
  const history = items.filter((item) => !isUpcomingOrOngoingDateRange(item));

  async function createItem() {
    const res = await fetch("/api/artist/profile/sections/exhibitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toExhibitionPayload(draft)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistExhibitionItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not create exhibition." });
      return;
    }
    const createdItem = json.item;
    const nextItems = [...items, createdItem];
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setDraft(emptyItem);
    setEditingId(null);
    setStatus({ tone: "success", text: "Exhibition added." });
  }

  async function updateItem(id: string, next: ArtistExhibitionItem) {
    const res = await fetch(`/api/artist/profile/sections/exhibitions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toExhibitionPayload(next)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistExhibitionItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not update exhibition." });
      return;
    }
    const updatedItem = json.item;
    const nextItems = items.map((item) => (item.id === id ? updatedItem : item));
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setEditingId(null);
    setStatus({ tone: "success", text: "Exhibition updated." });
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/artist/profile/sections/exhibitions/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete exhibition." });
      return;
    }
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setStatus({ tone: "success", text: "Exhibition removed." });
  }

  async function reorder(nextItems: ArtistExhibitionItem[]) {
    setItems(nextItems);
    const res = await fetch("/api/artist/profile/sections/exhibitions/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: toReorderIds(nextItems) }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; items?: ArtistExhibitionItem[]; error?: string } | null;
    if (!res.ok || !json?.items) {
      setStatus({ tone: "error", text: json?.error || "Could not reorder exhibitions." });
      return;
    }
    setItems(json.items);
    onItemsChange?.(json.items);
  }

  return (
    <Section
      title="Exhibitions"
      subtitle="One real data source for exhibition history and upcoming exhibitions."
      action={
        <Button type="button" tone="secondary" onClick={() => setEditingId(editingId === "__new__" ? null : "__new__")}>
          {editingId === "__new__" ? "Close" : "Add"}
        </Button>
      }
    >
      <div className="space-y-4">
        {editingId === "__new__" ? (
          <ExhibitionForm
            item={draft}
            onChange={setDraft}
            onSubmit={() => void createItem()}
            onCancel={() => {
              setDraft(emptyItem);
              setEditingId(null);
            }}
            submitLabel="Add exhibition"
          />
        ) : null}

        {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Upcoming exhibitions</div>
          {upcoming.length ? (
            upcoming.map((item) => {
              const index = items.findIndex((entry) => entry.id === item.id);
              return (
                <ExhibitionRow
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  editing={editingId === item.id}
                  onEdit={() => setEditingId(item.id)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => void deleteItem(item.id)}
                  onSave={(next) => void updateItem(item.id, next)}
                  onMoveUp={() => void reorder(moveItem(items, index, -1))}
                  onMoveDown={() => void reorder(moveItem(items, index, 1))}
                />
              );
            })
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No upcoming exhibitions yet.</div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">Exhibition history</div>
          {history.length ? (
            history.map((item) => {
              const index = items.findIndex((entry) => entry.id === item.id);
              return (
                <ExhibitionRow
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  editing={editingId === item.id}
                  onEdit={() => setEditingId(item.id)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => void deleteItem(item.id)}
                  onSave={(next) => void updateItem(item.id, next)}
                  onMoveUp={() => void reorder(moveItem(items, index, -1))}
                  onMoveDown={() => void reorder(moveItem(items, index, 1))}
                />
              );
            })
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No exhibition history yet.</div>
          )}
        </div>
      </div>
    </Section>
  );
}

function ExhibitionForm({
  item,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item: ArtistExhibitionItem;
  onChange: (item: ArtistExhibitionItem) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const coverItems = asSingleMedia(item.coverImageUrl, "other", "Cover image");

  function handleCoverChange(items: ArtistMediaItem[]) {
    onChange({ ...item, coverImageUrl: items[0]?.url || "" });
  }

  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} />
        <Input label="Venue / institution / gallery" value={item.venue} onChange={(event) => onChange({ ...item, venue: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Type" value={item.exhibitionType} onChange={(event) => onChange({ ...item, exhibitionType: event.target.value })} />
        <Input label="City" value={item.city} onChange={(event) => onChange({ ...item, city: event.target.value })} />
        <Input label="Country" value={item.country} onChange={(event) => onChange({ ...item, country: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Start date" type="date" value={item.startDate} onChange={(event) => onChange({ ...item, startDate: event.target.value })} />
        <Input
          label="End date"
          type="date"
          value={item.endDate}
          onChange={(event) => onChange({ ...item, endDate: event.target.value })}
          disabled={item.isOngoing}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField label="Ongoing / upcoming" checked={item.isOngoing} onChange={(checked) => onChange({ ...item, isOngoing: checked, endDate: checked ? "" : item.endDate })} />
        <CheckboxField label="Visible on public profile" checked={item.visibility === "public"} onChange={(checked) => onChange({ ...item, visibility: checked ? "public" : "private" })} />
      </div>
      <Input label="Link" value={item.link} onChange={(event) => onChange({ ...item, link: event.target.value })} />
      <Textarea label="Description" value={item.description} onChange={(event) => onChange({ ...item, description: event.target.value })} />
      <ImageUploader label="Cover image" kind="other" items={coverItems} onChange={handleCoverChange} />
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onSubmit}>
          {submitLabel}
        </Button>
        <Button type="button" tone="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ExhibitionRow({
  item,
  index,
  total,
  editing,
  onEdit,
  onCancel,
  onDelete,
  onSave,
  onMoveUp,
  onMoveDown,
}: {
  item: ArtistExhibitionItem;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (item: ArtistExhibitionItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, setDraft] = useState(item);

  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 px-4 py-4">
      {editing ? (
        <ExhibitionForm item={draft} onChange={setDraft} onSubmit={() => onSave(draft)} onCancel={onCancel} submitLabel="Save exhibition" />
      ) : (
        <>
          <div className="flex gap-4">
            {item.coverImageUrl ? (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[1.25rem] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.coverImageUrl} alt={item.title} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.title}</div>
              <div className="text-sm text-neutral-600">{[item.venue, item.exhibitionType].filter(Boolean).join(" · ")}</div>
              <div className="text-sm text-neutral-500">
                {[formatDateRange(item.startDate, item.endDate, item.isOngoing, "Ongoing"), item.city, item.country].filter(Boolean).join(" · ")}
              </div>
              {item.description ? <div className="text-sm leading-6 text-neutral-600">{item.description}</div> : null}
              {item.link ? <div className="text-sm text-neutral-500">{item.link}</div> : null}
              <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">{item.visibility}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Button type="button" tone="ghost" className="px-0 py-0" onClick={onEdit}>
              Edit
            </Button>
            <Button type="button" tone="ghost" className="px-0 py-0" onClick={onDelete}>
              Delete
            </Button>
            <Button type="button" tone="ghost" className="px-0 py-0" onClick={onMoveUp} disabled={index === 0}>
              Up
            </Button>
            <Button type="button" tone="ghost" className="px-0 py-0" onClick={onMoveDown} disabled={index === total - 1}>
              Down
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
