"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ConceptStatus = "draft" | "internal_review" | "ready_to_send" | "sent" | "won" | "lost";
type ConceptGranularity = "short" | "standard" | "detailed";

type Sections = {
  goalContext?: string;
  targetAudience?: string;
  narrative?: string;
  kpis?: string;
  legal?: string;
};

type Concept = {
  _id: string;
  title: string;
  brandKey: "artclub" | "alea";
  type: "sponsoring" | "leasing" | "event";
  granularity: ConceptGranularity;
  status: ConceptStatus;
  sections?: Sections;
  notes?: string;
  updatedAt?: string;
};

const statusOptions: ConceptStatus[] = ["draft", "internal_review", "ready_to_send", "sent", "won", "lost"];
const granularityOptions: ConceptGranularity[] = ["short", "standard", "detailed"];

type Props = {
  conceptId: string;
};

export default function ConceptDetailClient({ conceptId }: Props) {
  const router = useRouter();
  const [concept, setConcept] = useState<Concept | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [granularity, setGranularity] = useState<ConceptGranularity>("standard");
  const [status, setStatus] = useState<ConceptStatus>("draft");
  const [sections, setSections] = useState<Sections>({
    goalContext: "",
    targetAudience: "",
    narrative: "",
    kpis: "",
    legal: "",
  });
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/concepts/${conceptId}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { concept?: Concept; error?: string } | null;
        if (!res.ok) {
          throw new Error(json?.error || "Failed to load concept");
        }
        if (!active) return;
        const data = json?.concept;
        if (!data) throw new Error("Concept not found");
        setConcept(data);
        setTitle(data.title || "");
        setGranularity(data.granularity);
        setStatus(data.status);
        setSections({
          goalContext: data.sections?.goalContext ?? "",
          targetAudience: data.sections?.targetAudience ?? "",
          narrative: data.sections?.narrative ?? "",
          kpis: data.sections?.kpis ?? "",
          legal: data.sections?.legal ?? "",
        });
        setNotes(data.notes ?? "");
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load concept";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [conceptId]);

  const statusLabel = useMemo(() => status.replace(/_/g, " "), [status]);

  const handleSave = async () => {
    if (!concept) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/concepts/${conceptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          granularity,
          sections,
          notes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save");
      }
      setConcept(json?.concept || concept);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (nextStatus: ConceptStatus) => {
    if (!concept) return;
    setStatusSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/concepts/${conceptId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to update status");
      }
      const updated = json?.concept as Concept | undefined;
      if (updated) {
        setConcept(updated);
        setStatus(updated.status);
      } else {
        setStatus(nextStatus);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      setError(message);
    } finally {
      setStatusSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-600">Loading concept…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          className="rounded border border-slate-200 px-3 py-2 text-sm"
          onClick={() => router.refresh()}
          disabled={saving || statusSaving}
        >
          Retry
        </button>
      </main>
    );
  }

  if (!concept) {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-600">Concept not found.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-slate-500">
            {concept.brandKey} • {concept.type}
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <input
              className="w-full rounded border border-slate-200 px-3 py-2 text-lg font-semibold md:w-96"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              className="rounded border border-slate-200 px-3 py-2 text-sm md:w-40"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as ConceptGranularity)}
            >
              {granularityOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500">
            Last updated {concept.updatedAt ? new Date(concept.updatedAt).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as ConceptStatus)}
            disabled={statusSaving}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Sections</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Goal / Context"
            value={sections.goalContext ?? ""}
            onChange={(v) => setSections((prev) => ({ ...prev, goalContext: v }))}
          />
          <Field
            label="Target Audience"
            value={sections.targetAudience ?? ""}
            onChange={(v) => setSections((prev) => ({ ...prev, targetAudience: v }))}
          />
          <Field
            label="Narrative"
            value={sections.narrative ?? ""}
            onChange={(v) => setSections((prev) => ({ ...prev, narrative: v }))}
          />
          <Field
            label="KPIs"
            value={sections.kpis ?? ""}
            onChange={(v) => setSections((prev) => ({ ...prev, kpis: v }))}
          />
          <Field
            label="Legal"
            value={sections.legal ?? ""}
            onChange={(v) => setSections((prev) => ({ ...prev, legal: v }))}
          />
        </div>
      </section>

      <section className="card space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="concept-notes">
          Notes
        </label>
        <textarea
          id="concept-notes"
          className="min-h-[120px] w-full rounded border border-slate-200 px-3 py-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      {statusSaving && <p className="text-xs text-slate-600">Updating status to {statusLabel}…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function Field({ label, value, onChange }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <textarea
        className="min-h-[120px] w-full rounded border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
