"use client";

import { useState } from "react";

import { ImageUploader } from "@/components/forms/ImageUploader";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Section } from "@/components/primitives/Section";
import { asSingleMedia, formatDateRange, moveItem, toReorderIds } from "@/components/profile/section-utils";
import type { ArtistEducationItem, ArtistMediaItem } from "@/lib/types";

type EducationSectionProps = {
  initialItems: ArtistEducationItem[];
  onItemsChange?: (items: ArtistEducationItem[]) => void;
  initialOpenCreate?: boolean;
};

const emptyItem: ArtistEducationItem = {
  id: "",
  school: "",
  degree: "",
  fieldOfStudy: "",
  startDate: "",
  endDate: "",
  grade: "",
  activities: "",
  description: "",
  courses: "",
  imageUrl: "",
  sortOrder: 0,
};

function toEducationPayload(item: ArtistEducationItem) {
  return {
    school: item.school,
    degree: item.degree,
    fieldOfStudy: item.fieldOfStudy,
    startDate: item.startDate,
    endDate: item.endDate,
    grade: item.grade,
    activities: item.activities,
    description: item.description,
    courses: item.courses,
    imageUrl: item.imageUrl,
  };
}

export function EducationSection({ initialItems, onItemsChange, initialOpenCreate = false }: EducationSectionProps) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(initialOpenCreate ? "__new__" : null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function createItem() {
    const res = await fetch("/api/artist/profile/sections/education", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toEducationPayload(draft)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistEducationItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not create education entry." });
      return;
    }
    const createdItem = json.item;
    const nextItems = [...items, createdItem];
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setDraft(emptyItem);
    setEditingId(null);
    setStatus({ tone: "success", text: "Education entry added." });
  }

  async function updateItem(id: string, next: ArtistEducationItem) {
    const res = await fetch(`/api/artist/profile/sections/education/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toEducationPayload(next)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistEducationItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not update education entry." });
      return;
    }
    const updatedItem = json.item;
    const nextItems = items.map((item) => (item.id === id ? updatedItem : item));
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setEditingId(null);
    setStatus({ tone: "success", text: "Education entry updated." });
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/artist/profile/sections/education/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete education entry." });
      return;
    }
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setStatus({ tone: "success", text: "Education entry removed." });
  }

  async function reorder(nextItems: ArtistEducationItem[]) {
    setItems(nextItems);
    const res = await fetch("/api/artist/profile/sections/education/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: toReorderIds(nextItems) }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; items?: ArtistEducationItem[]; error?: string } | null;
    if (!res.ok || !json?.items) {
      setStatus({ tone: "error", text: json?.error || "Could not reorder education entries." });
      return;
    }
    setItems(json.items);
    onItemsChange?.(json.items);
  }

  return (
    <Section
      title="Education"
      subtitle="Formal education and training, stored directly on CanonicalArtist."
      action={
        <Button type="button" tone="secondary" onClick={() => setEditingId(editingId === "__new__" ? null : "__new__")}>
          {editingId === "__new__" ? "Close" : "Add"}
        </Button>
      }
    >
      <div className="space-y-4">
        {editingId === "__new__" ? (
          <EducationForm
            item={draft}
            onChange={setDraft}
            onSubmit={() => void createItem()}
            onCancel={() => {
              setDraft(emptyItem);
              setEditingId(null);
            }}
            submitLabel="Add education"
          />
        ) : null}

        {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

        {items.length ? (
          items.map((item, index) => (
            <EducationRow
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
          <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No education entries yet.</div>
        )}
      </div>
    </Section>
  );
}

function EducationForm({
  item,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item: ArtistEducationItem;
  onChange: (item: ArtistEducationItem) => void;
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
        <Input label="School" value={item.school} onChange={(event) => onChange({ ...item, school: event.target.value })} />
        <Input label="Degree" value={item.degree} onChange={(event) => onChange({ ...item, degree: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Field of study" value={item.fieldOfStudy} onChange={(event) => onChange({ ...item, fieldOfStudy: event.target.value })} />
        <Input label="Grade" value={item.grade} onChange={(event) => onChange({ ...item, grade: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Start date" type="date" value={item.startDate} onChange={(event) => onChange({ ...item, startDate: event.target.value })} />
        <Input label="End date" type="date" value={item.endDate} onChange={(event) => onChange({ ...item, endDate: event.target.value })} />
      </div>
      <Textarea label="Activities" value={item.activities} onChange={(event) => onChange({ ...item, activities: event.target.value })} />
      <Textarea label="Courses" value={item.courses} onChange={(event) => onChange({ ...item, courses: event.target.value })} />
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

function EducationRow({
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
  item: ArtistEducationItem;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (item: ArtistEducationItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, setDraft] = useState(item);

  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 px-4 py-4">
      {editing ? (
        <EducationForm item={draft} onChange={setDraft} onSubmit={() => onSave(draft)} onCancel={onCancel} submitLabel="Save education" />
      ) : (
        <>
          <div className="flex gap-4">
            {item.imageUrl ? (
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[1.25rem] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt={item.school} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.school}</div>
              <div className="text-sm text-neutral-600">{[item.degree, item.fieldOfStudy].filter(Boolean).join(" · ")}</div>
              <div className="text-sm text-neutral-500">{formatDateRange(item.startDate, item.endDate, false, "")}</div>
              {item.grade ? <div className="text-sm text-neutral-500">Grade: {item.grade}</div> : null}
              {item.activities ? <div className="text-sm leading-6 text-neutral-600">{item.activities}</div> : null}
              {item.courses ? <div className="text-sm leading-6 text-neutral-600">{item.courses}</div> : null}
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
