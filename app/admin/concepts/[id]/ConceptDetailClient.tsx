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
const steps = [
  { key: "basics", label: "Basics" },
  { key: "content", label: "Content" },
  { key: "assets", label: "Assets & References" },
  { key: "export", label: "Export" },
] as const;
type StepKey = (typeof steps)[number]["key"];

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

  const scrollToStep = (step: StepKey) => {
    const el = document.getElementById(`concept-step-${step}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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
    <main className="p-6">
      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="rounded-xl bg-white/70 p-4 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Concept Flow</h2>
          <ol className="space-y-2 text-sm">
            {steps.map((step, idx) => {
              const isActive =
                (step.key === "basics" && !statusSaving && !saving) ||
                (step.key === "content" && !statusSaving) ||
                step.key === "assets" ||
                step.key === "export";
              return (
                <li key={step.key}>
                  <button
                    type="button"
                    onClick={() => scrollToStep(step.key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                      isActive ? "bg-slate-900 text-white shadow-sm" : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-current text-xs font-semibold">
                      {idx + 1}
                    </span>
                    <span className="font-medium">{step.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="space-y-6">
          <div
            id="concept-step-basics"
            className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-4"
          >
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500">
                  {concept.brandKey} • {concept.type}
                </p>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold md:w-96"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:w-40"
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

              <div className="flex flex-col items-start gap-3 md:items-end">
                <select
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">
                Status: <span className="font-semibold">{statusLabel}</span>
              </div>
              <button
                type="button"
                className="text-sm text-blue-600 hover:underline"
                onClick={() => scrollToStep("content")}
              >
                Next: Content ↓
              </button>
            </div>
          </div>

          <div
            id="concept-step-content"
            className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Content</h2>
              <span className="text-xs text-slate-500">Draft the narrative and context</span>
            </div>
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="concept-notes">
                Notes
              </label>
              <textarea
                id="concept-notes"
                className="min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save content"}
              </button>
              <button
                type="button"
                className="text-sm text-blue-600 hover:underline"
                onClick={() => scrollToStep("assets")}
              >
                Next: Assets & References ↓
              </button>
            </div>
          </div>

          <div
            id="concept-step-assets"
            className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assets & References</h2>
              <span className="text-xs text-slate-500">Coming next</span>
            </div>
            <p className="text-sm text-slate-600">
              Attach artworks, collections, artists, and supporting files to enrich this concept. This section will be added
              soon.
            </p>
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => scrollToStep("export")}
            >
              Next: Export ↓
            </button>
          </div>

          <div
            id="concept-step-export"
            className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Export</h2>
              <span className="text-xs text-slate-500">Coming next</span>
            </div>
            <p className="text-sm text-slate-600">
              Generate proposal documents and outreach drafts here. Export tools will be added in the next iteration.
            </p>
          </div>

          {statusSaving && <p className="text-xs text-slate-600">Updating status to {statusLabel}…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>
      </div>
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
