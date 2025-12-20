"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type BrandKey = "artclub" | "alea";
type ConceptType = "sponsoring" | "leasing" | "event";
type Granularity = "short" | "standard" | "detailed";

const brandOptions: BrandKey[] = ["artclub", "alea"];
const typeOptions: ConceptType[] = ["sponsoring", "leasing", "event"];
const granularityOptions: Granularity[] = ["short", "standard", "detailed"];

export default function NewConceptPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [brandKey, setBrandKey] = useState<BrandKey>("artclub");
  const [type, setType] = useState<ConceptType>("sponsoring");
  const [granularity, setGranularity] = useState<Granularity>("standard");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, brandKey, type, granularity }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to create concept");
      }
      const id = json?.concept?._id;
      if (!id) throw new Error("No concept id returned");
      router.push(`/admin/concepts/${id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create concept";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">New Concept</h1>
        <p className="text-sm text-slate-600">Create a concept for a client proposal.</p>
      </header>

      <form onSubmit={handleSubmit} className="card space-y-4 max-w-2xl">
        <div className="space-y-1">
          <label htmlFor="concept-title" className="text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="concept-title"
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summer partnership kickoff"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="concept-brand" className="text-sm font-medium text-slate-700">
              Brand
            </label>
            <select
              id="concept-brand"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={brandKey}
              onChange={(e) => setBrandKey(e.target.value as BrandKey)}
            >
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="concept-type" className="text-sm font-medium text-slate-700">
              Type
            </label>
            <select
              id="concept-type"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as ConceptType)}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="concept-granularity" className="text-sm font-medium text-slate-700">
              Granularity
            </label>
            <select
              id="concept-granularity"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
            >
              {granularityOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
