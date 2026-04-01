"use client";

import { useState } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Section } from "@/components/primitives/Section";
import { asSingleMedia, formatDateRange, moveItem, toReorderIds } from "@/components/profile/section-utils";
import type { ArtistExperienceItem, ArtistMediaItem } from "@/lib/types";

type ExperienceSectionProps = {
  initialItems: ArtistExperienceItem[];
  onItemsChange?: (items: ArtistExperienceItem[]) => void;
};

const emptyItem: ArtistExperienceItem = {
  id: "",
  title: "",
  organization: "",
  employmentType: "",
  location: "",
  locationType: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  description: "",
  imageUrl: "",
  sortOrder: 0,
};

function toExperiencePayload(item: ArtistExperienceItem) {
  return {
    title: item.title,
    organization: item.organization,
    employmentType: item.employmentType,
    location: item.location,
    locationType: item.locationType,
    startDate: item.startDate,
    endDate: item.endDate,
    isCurrent: item.isCurrent,
    description: item.description,
    imageUrl: item.imageUrl,
  };
}

export function ExperienceSection({ initialItems, onItemsChange }: ExperienceSectionProps) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function createItem() {
    const res = await fetch("/api/artist/profile/sections/experience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toExperiencePayload(draft)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistExperienceItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not create experience entry." });
      return;
    }
    const createdItem = json.item;
    const nextItems = [...items, createdItem];
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setDraft(emptyItem);
    setEditingId(null);
    setStatus({ tone: "success", text: "Experience entry added." });
  }

  async function updateItem(id: string, next: ArtistExperienceItem) {
    const res = await fetch(`/api/artist/profile/sections/experience/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toExperiencePayload(next)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistExperienceItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not update experience entry." });
      return;
    }
    const updatedItem = json.item;
    const nextItems = items.map((item) => (item.id === id ? updatedItem : item));
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setEditingId(null);
    setStatus({ tone: "success", text: "Experience entry updated." });
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/artist/profile/sections/experience/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete experience entry." });
      return;
    }
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setStatus({ tone: "success", text: "Experience entry removed." });
  }

  async function reorder(nextItems: ArtistExperienceItem[]) {
    setItems(nextItems);
    const res = await fetch("/api/artist/profile/sections/experience/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: toReorderIds(nextItems) }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; items?: ArtistExperienceItem[]; error?: string } | null;
    if (!res.ok || !json?.items) {
      setStatus({ tone: "error", text: json?.error || "Could not reorder experience entries." });
      return;
    }
    setItems(json.items);
    onItemsChange?.(json.items);
  }

  return (
    <Section
      title="Experience"
      subtitle="Professional and artistic background entries, stored on the canonical artist profile."
      action={
        <Button type="button" tone="secondary" onClick={() => setEditingId(editingId === "__new__" ? null : "__new__")}>
          {editingId === "__new__" ? "Close" : "Add"}
        </Button>
      }
    >
      <div className="space-y-4">
        {editingId === "__new__" ? (
          <ExperienceForm
            item={draft}
            onChange={setDraft}
            onSubmit={() => void createItem()}
            onCancel={() => {
              setDraft(emptyItem);
              setEditingId(null);
            }}
            submitLabel="Add experience"
          />
        ) : null}

        {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

        {items.length ? (
          items.map((item, index) => (
            <ExperienceRow
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
          ))
        ) : (
          <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No experience entries yet.</div>
        )}
      </div>
    </Section>
  );
}

function ExperienceForm({
  item,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item: ArtistExperienceItem;
  onChange: (item: ArtistExperienceItem) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const logoItems = asSingleMedia(item.imageUrl, "other", "Logo");

  function handleLogoChange(items: ArtistMediaItem[]) {
    onChange({ ...item, imageUrl: items[0]?.url || "" });
  }

  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} />
        <Input label="Organization" value={item.organization} onChange={(event) => onChange({ ...item, organization: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Employment type" value={item.employmentType} onChange={(event) => onChange({ ...item, employmentType: event.target.value })} />
        <Input label="Location" value={item.location} onChange={(event) => onChange({ ...item, location: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Location type" value={item.locationType} onChange={(event) => onChange({ ...item, locationType: event.target.value })} />
        <Input label="Start date" type="date" value={item.startDate} onChange={(event) => onChange({ ...item, startDate: event.target.value })} />
        <Input
          label="End date"
          type="date"
          value={item.endDate}
          onChange={(event) => onChange({ ...item, endDate: event.target.value })}
          disabled={item.isCurrent}
        />
      </div>
      <CheckboxField label="Current role" checked={item.isCurrent} onChange={(checked) => onChange({ ...item, isCurrent: checked, endDate: checked ? "" : item.endDate })} />
      <Textarea label="Description" value={item.description} onChange={(event) => onChange({ ...item, description: event.target.value })} />
      <ImageUploader label="Logo or image" kind="other" items={logoItems} onChange={handleLogoChange} />
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

function ExperienceRow({
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
  item: ArtistExperienceItem;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (item: ArtistExperienceItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, setDraft] = useState(item);

  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 px-4 py-4">
      {editing ? (
        <ExperienceForm item={draft} onChange={setDraft} onSubmit={() => onSave(draft)} onCancel={onCancel} submitLabel="Save experience" />
      ) : (
        <>
          <div className="flex gap-4">
            {item.imageUrl ? (
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[1.25rem] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt={item.organization} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.title}</div>
              <div className="text-sm text-neutral-600">
                {[item.organization, item.employmentType].filter(Boolean).join(" · ")}
              </div>
              <div className="text-sm text-neutral-500">
                {[formatDateRange(item.startDate, item.endDate, item.isCurrent, "Present"), item.location, item.locationType].filter(Boolean).join(" · ")}
              </div>
              {item.description ? <div className="text-sm leading-6 text-neutral-600">{item.description}</div> : null}
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
