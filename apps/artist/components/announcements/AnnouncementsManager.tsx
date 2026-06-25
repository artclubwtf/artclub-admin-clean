"use client";

import { useState } from "react";

import { useArtistSuccessNotice } from "@/components/feedback/ArtistSuccessNotice";
import { CheckboxField } from "@/components/forms/CheckboxField";
import { MultiStepForm } from "@/components/forms/MultiStepForm";
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
  embedded?: boolean;
  onItemsChange?: (items: ArtistAnnouncementItem[]) => void;
  initialOpenCreate?: boolean;
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

function toAnnouncementPayload(item: ArtistAnnouncementItem) {
  return {
    title: item.title,
    body: item.body,
    ctaLabel: item.ctaLabel,
    ctaUrl: item.ctaUrl,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    isPinned: item.isPinned,
    isPublished: item.isPublished,
  };
}

export function AnnouncementsManager({ initialItems, embedded = false, onItemsChange, initialOpenCreate = false }: AnnouncementsManagerProps) {
  const { showSuccessNotice } = useArtistSuccessNotice();
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState(emptyAnnouncement);
  const [editingId, setEditingId] = useState<string | null>(initialOpenCreate ? "__new__" : null);
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function createItem() {
    const res = await fetch("/api/artist/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toAnnouncementPayload(draft)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; announcement?: ArtistAnnouncementItem; error?: string } | null;
    if (!res.ok || !json?.announcement) {
      setStatus({ tone: "error", text: json?.error || "Could not create announcement." });
      return;
    }
    const createdAnnouncement = json.announcement;
    const nextItems = [...items, createdAnnouncement];
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setDraft(emptyAnnouncement);
    setEditingId(null);
    setStatus(null);
    showSuccessNotice();
  }

  async function updateItem(id: string, next: ArtistAnnouncementItem) {
    const res = await fetch(`/api/artist/announcements/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toAnnouncementPayload(next)),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; announcement?: ArtistAnnouncementItem; error?: string } | null;
    if (!res.ok || !json?.announcement) {
      setStatus({ tone: "error", text: json?.error || "Could not update announcement." });
      return;
    }
    const updatedAnnouncement = json.announcement;
    const nextItems = items.map((item) => (item.id === id ? updatedAnnouncement : item));
    setItems(nextItems);
    onItemsChange?.(nextItems);
    setEditingId(null);
    setStatus(null);
    showSuccessNotice();
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/artist/announcements/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not delete announcement." });
      return;
    }
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    onItemsChange?.(nextItems);
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
    onItemsChange?.(json.announcements);
  }

  return (
    <div className="space-y-8">
      {embedded ? null : (
        <PageTitle title="Announcements" subtitle="Draft, publish and pin announcement entries for future artist profile pages." />
      )}

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
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const steps = [
    { key: "content", title: "Content", description: "Write the announcement headline and message." },
    { key: "cta", title: "CTA", description: "Optional call-to-action text and link." },
    { key: "schedule", title: "Schedule", description: "Set timing, publish state and pinning." },
    { key: "review", title: "Review", description: "Check the announcement before saving." },
  ];

  function validateCurrentStep() {
    if (step === 0 && !item.title.trim()) return "Enter a title.";
    if (step === 0 && !item.body.trim()) return "Enter announcement content.";
    return null;
  }

  return (
    <div className="rounded-[2rem] bg-neutral-50 p-4">
      <MultiStepForm
        steps={steps}
        currentStep={step}
        onBack={() => {
          setStepError(null);
          setStep((current) => Math.max(current - 1, 0));
        }}
        onNext={() => {
          const error = validateCurrentStep();
          if (error) {
            setStepError(error);
            return;
          }
          setStepError(null);
          setStep((current) => Math.min(current + 1, steps.length - 1));
        }}
        onSubmit={() => void onSubmit()}
        canGoBack={step > 0}
        isLastStep={step === steps.length - 1}
        submitLabel={submitLabel}
        footerHint={stepError ? <StatusMessage tone="error">{stepError}</StatusMessage> : null}
      >
        {step === 0 ? (
          <div className="space-y-4">
            <Input label="Title" value={item.title} onChange={(event) => onChange({ ...item, title: event.target.value })} />
            <Textarea label="Body" value={item.body} onChange={(event) => onChange({ ...item, body: event.target.value })} />
          </div>
        ) : null}
        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="CTA label" value={item.ctaLabel} onChange={(event) => onChange({ ...item, ctaLabel: event.target.value })} />
            <Input label="CTA URL" value={item.ctaUrl} onChange={(event) => onChange({ ...item, ctaUrl: event.target.value })} />
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Starts at" type="date" value={item.startsAt} onChange={(event) => onChange({ ...item, startsAt: event.target.value })} />
              <Input label="Ends at" type="date" value={item.endsAt} onChange={(event) => onChange({ ...item, endsAt: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckboxField label="Published" checked={item.isPublished} onChange={(checked) => onChange({ ...item, isPublished: checked })} />
              <CheckboxField label="Pinned" checked={item.isPinned} onChange={(checked) => onChange({ ...item, isPinned: checked })} />
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="rounded-[1.75rem] bg-white px-4 py-4 text-sm leading-7 text-neutral-600">
            <div><span className="font-medium text-neutral-900">Title:</span> {item.title || "Not set"}</div>
            <div><span className="font-medium text-neutral-900">Body:</span> {item.body || "Not set"}</div>
            <div><span className="font-medium text-neutral-900">CTA:</span> {[item.ctaLabel, item.ctaUrl].filter(Boolean).join(" · ") || "No CTA"}</div>
            <div><span className="font-medium text-neutral-900">Schedule:</span> {[item.startsAt, item.endsAt].filter(Boolean).join(" - ") || "No schedule"}</div>
            <div><span className="font-medium text-neutral-900">State:</span> {item.isPublished ? "Published" : "Draft"}{item.isPinned ? " · Pinned" : ""}</div>
          </div>
        ) : null}
        <div className="pt-1">
          <Button type="button" tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </MultiStepForm>
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
