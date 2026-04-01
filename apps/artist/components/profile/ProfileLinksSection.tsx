"use client";

import { useState } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Section } from "@/components/primitives/Section";
import { moveItem, summarizeHost, toReorderIds } from "@/components/profile/section-utils";
import type { ArtistProfileLinkItem } from "@/lib/types";

type ProfileLinksSectionProps = {
  initialItems: ArtistProfileLinkItem[];
};

const emptyDraft: ArtistProfileLinkItem = {
  id: "",
  label: "",
  url: "",
  type: "custom",
  sortOrder: 0,
  isVisible: true,
  isHighlighted: false,
};

const typeOptions = ["instagram", "website", "shop", "behance", "linkedin", "tiktok", "youtube", "custom"];

export function ProfileLinksSection({ initialItems }: ProfileLinksSectionProps) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState<ArtistProfileLinkItem>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function createItem() {
    const res = await fetch("/api/artist/profile/sections/profileLinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: draft.label,
        url: draft.url,
        type: draft.type,
        isVisible: draft.isVisible,
        isHighlighted: draft.isHighlighted,
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistProfileLinkItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not create link." });
      return;
    }
    const createdItem = json.item;
    setItems((current) => [...current, createdItem]);
    setDraft(emptyDraft);
    setStatus({ tone: "success", text: "Link added." });
  }

  async function updateItem(id: string, next: ArtistProfileLinkItem) {
    const res = await fetch(`/api/artist/profile/sections/profileLinks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: next.label,
        url: next.url,
        type: next.type,
        isVisible: next.isVisible,
        isHighlighted: next.isHighlighted,
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; item?: ArtistProfileLinkItem; error?: string } | null;
    if (!res.ok || !json?.item) {
      setStatus({ tone: "error", text: json?.error || "Could not update link." });
      return;
    }
    const updatedItem = json.item;
    setItems((current) => current.map((item) => (item.id === id ? updatedItem : item)));
    setEditingId(null);
    setStatus({ tone: "success", text: "Link updated." });
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/artist/profile/sections/profileLinks/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete link." });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setStatus({ tone: "success", text: "Link removed." });
  }

  async function reorder(nextItems: ArtistProfileLinkItem[]) {
    setItems(nextItems);
    const res = await fetch("/api/artist/profile/sections/profileLinks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: toReorderIds(nextItems) }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; items?: ArtistProfileLinkItem[]; error?: string } | null;
    if (!res.ok || !json?.items) {
      setStatus({ tone: "error", text: json?.error || "Could not reorder links." });
      return;
    }
    setItems(json.items);
  }

  return (
    <Section
      title="Links"
      subtitle="A small linktree-like set of profile links, stored on CanonicalArtist."
      action={
        <Button type="button" tone="secondary" onClick={() => setEditingId(editingId === "__new__" ? null : "__new__")}>
          {editingId === "__new__" ? "Close" : "Add"}
        </Button>
      }
    >
      <div className="space-y-4">
        {editingId === "__new__" ? (
          <LinkForm
            item={draft}
            onChange={setDraft}
            onSubmit={() => void createItem()}
            onCancel={() => {
              setDraft(emptyDraft);
              setEditingId(null);
            }}
            submitLabel="Add link"
          />
        ) : null}

        {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

        {items.length ? (
          items.map((item, index) => (
            <LinkRow
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
          <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No links yet.</div>
        )}
      </div>
    </Section>
  );
}

function LinkForm({
  item,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item: ArtistProfileLinkItem;
  onChange: (item: ArtistProfileLinkItem) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4 rounded-[2rem] bg-neutral-50 p-4">
      <Input label="Label" value={item.label} onChange={(event) => onChange({ ...item, label: event.target.value })} />
      <Input label="URL" value={item.url} onChange={(event) => onChange({ ...item, url: event.target.value })} />
      <label className="block space-y-2">
        <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">Type</span>
        <select
          value={item.type}
          onChange={(event) => onChange({ ...item, type: event.target.value })}
          className="w-full rounded-3xl bg-white px-4 py-3.5 text-[15px] text-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10"
        >
          {typeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField label="Visible" checked={item.isVisible} onChange={(checked) => onChange({ ...item, isVisible: checked })} />
        <CheckboxField
          label="Highlight"
          checked={item.isHighlighted}
          onChange={(checked) => onChange({ ...item, isHighlighted: checked })}
        />
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

function LinkRow({
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
  item: ArtistProfileLinkItem;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (item: ArtistProfileLinkItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, setDraft] = useState(item);

  return (
    <div className="space-y-3 rounded-[2rem] bg-neutral-50 px-4 py-4">
      {editing ? (
        <LinkForm item={draft} onChange={setDraft} onSubmit={() => onSave(draft)} onCancel={onCancel} submitLabel="Save link" />
      ) : (
        <>
          <div className="space-y-1">
            <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.label}</div>
            <div className="text-sm text-neutral-500">{summarizeHost(item.url)} · {item.type}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
              {item.isVisible ? "visible" : "hidden"}
              {item.isHighlighted ? " · highlighted" : ""}
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
