"use client";

import { useState } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Textarea } from "@/components/forms/Textarea";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import { moveItem, toReorderIds } from "@/components/profile/section-utils";
import type { ArtistAnnouncementItem } from "@/lib/types";

type AnnouncementsManagerProps = {
  initialItems: ArtistAnnouncementItem[];
};

const emptyAnnouncement: ArtistAnnouncementItem = {
  id: "",
  title: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  startsAt: "",
  endsAt: "",
  isPinned: false,
  isPublished: false,
  sortOrder: 0,
};

export function AnnouncementsManager({ initialItems }: AnnouncementsManagerProps) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState(emptyAnnouncement);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function createItem() {
    const res = await fetch("/api/artist/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; announcement?: ArtistAnnouncementItem; error?: string } | null;
    if (!res.ok || !json?.announcement) {
      setStatus({ tone: "error", text: json?.error || "Could not create announcement." });
      return;
    }
    const createdAnnouncement = json.announcement;
    setItems((current) => [...current, createdAnnouncement]);
    setDraft(emptyAnnouncement);
    setEditingId(null);
    setStatus({ tone: "success", text: "Announcement created." });
  }

  async function updateItem(id: string, next: ArtistAnnouncementItem) {
    const res = await fetch(`/api/artist/announcements/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; announcement?: ArtistAnnouncementItem; error?: string } | null;
    if (!res.ok || !json?.announcement) {
      setStatus({ tone: "error", text: json?.error || "Could not update announcement." });
      return;
    }
    const updatedAnnouncement = json.announcement;
    setItems((current) => current.map((item) => (item.id === id ? updatedAnnouncement : item)));
    setEditingId(null);
    setStatus({ tone: "success", text: "Announcement updated." });
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/artist/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete announcement." });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setStatus({ tone: "success", text: "Announcement deleted." });
  }

  async function reorder(nextItems: ArtistAnnouncementItem[]) {
    setItems(nextItems);
    const res = await fetch("/api/artist/announcements/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: toReorderIds(nextItems) }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; announcements?: ArtistAnnouncementItem[]; error?: string } | null;
    if (!res.ok || !json?.announcements) {
      setStatus({ tone: "error", text: json?.error || "Could not reorder announcements." });
      return;
    }
    setItems(json.announcements);
  }

  return (
    <div className="space-y-8">
      <PageTitle title="Announcements" subtitle="Draft, publish and pin announcement entries for future artist profile pages." />

      <Section
        title="Manage announcements"
        subtitle="Stored in a dedicated artist announcement collection and scoped to the current artist."
        action={
          <Button type="button" tone="secondary" onClick={() => setEditingId(editingId === "__new__" ? null : "__new__")}>
            {editingId === "__new__" ? "Close" : "Add"}
          </Button>
        }
      >
        <div className="space-y-4">
          {editingId === "__new__" ? (
            <AnnouncementForm
              item={draft}
              onChange={setDraft}
              onSubmit={() => void createItem()}
              onCancel={() => {
                setDraft(emptyAnnouncement);
                setEditingId(null);
              }}
              submitLabel="Create announcement"
            />
          ) : null}

          {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

          {items.length ? (
            items.map((item, index) => (
              <AnnouncementRow
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
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No announcements yet.</div>
          )}
        </div>
      </Section>
    </div>
  );
}

function AnnouncementForm({
  item,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item: ArtistAnnouncementItem;
  onChange: (item: ArtistAnnouncementItem) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 p-4">
      <Input label="Title" value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} />
      <Textarea label="Body" value={item.body} onChange={(event) => onChange({ ...item, body: event.target.value })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="CTA label" value={item.ctaLabel} onChange={(event) => onChange({ ...item, ctaLabel: event.target.value })} />
        <Input label="CTA URL" value={item.ctaUrl} onChange={(event) => onChange({ ...item, ctaUrl: event.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Starts at" type="date" value={item.startsAt} onChange={(event) => onChange({ ...item, startsAt: event.target.value })} />
        <Input label="Ends at" type="date" value={item.endsAt} onChange={(event) => onChange({ ...item, endsAt: event.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField label="Published" checked={item.isPublished} onChange={(checked) => onChange({ ...item, isPublished: checked })} />
        <CheckboxField label="Pinned" checked={item.isPinned} onChange={(checked) => onChange({ ...item, isPinned: checked })} />
      </div>
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

function AnnouncementRow({
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
  item: ArtistAnnouncementItem;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (item: ArtistAnnouncementItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, setDraft] = useState(item);

  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 px-4 py-4">
      {editing ? (
        <AnnouncementForm item={draft} onChange={setDraft} onSubmit={() => onSave(draft)} onCancel={onCancel} submitLabel="Save announcement" />
      ) : (
        <>
          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.title}</div>
            <div className="text-sm leading-6 text-neutral-600">{item.body}</div>
            <div className="text-sm text-neutral-500">
              {[item.startsAt, item.endsAt].filter(Boolean).join(" - ")}
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
              {item.isPublished ? "published" : "draft"}
              {item.isPinned ? " · pinned" : ""}
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
