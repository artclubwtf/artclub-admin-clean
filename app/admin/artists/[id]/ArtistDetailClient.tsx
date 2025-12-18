"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Artist = {
  _id: string;
  name: string;
  email?: string;
  status?: string;
  tags?: string[];
  notes?: string;
};

const statusOptions = ["lead", "onboarding", "active", "paused"] as const;

function normalizeId(value: any) {
  if (typeof value === "string") return value;
  if (value && typeof value.$oid === "string") return value.$oid;
  if (value && typeof value.toHexString === "function") return value.toHexString();
  if (value && typeof value.toString === "function") return value.toString();
  return "";
}

function normalizeArtist(raw: any): Artist {
  return {
    _id: normalizeId(raw?._id),
    name: raw?.name ?? "",
    email: raw?.email ?? "",
    status: raw?.status ?? "",
    tags: raw?.tags ?? [],
    notes: raw?.notes ?? "",
  };
}

function parseErrorMessage(payload: any) {
  if (!payload) return "Unexpected error";
  if (typeof payload === "string") return payload;
  if (payload.error) {
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
  }
  return "Unexpected error";
}

export default function ArtistDetailClient({ artistId }: { artistId: string }) {
  const router = useRouter();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("lead");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/artists/${artistId}`, { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        const data: Artist = normalizeArtist(json.data);
        setArtist(data);
        setName(data.name ?? "");
        setEmail(data.email ?? "");
        setStatus(data.status ?? "lead");
        setTagsInput(data.tags?.join(", ") ?? "");
        setNotes(data.notes ?? "");
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load artist");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [artistId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/artists/${artistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          status: status || undefined,
          tags,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }

      const json = await res.json();
      setArtist(normalizeArtist(json.data));
      setSaveMessage("Saved");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save artist");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    const confirmed = window.confirm("Delete this artist? This cannot be undone.");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/artists/${artistId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      router.push("/admin/artists");
      router.refresh();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Failed to delete artist");
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading artist...</p>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Error: {error}</p>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Artist not found.</p>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">ID</div>
          <div className="font-mono text-sm text-slate-700">{artist._id}</div>
        </div>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Tags</label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="comma,separated,tags"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-500">Enter tags separated by commas.</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={4}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        {error && <p className="text-sm text-red-600">Error: {error}</p>}
        {saveMessage && <p className="text-sm text-green-600">{saveMessage}</p>}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-red-600 underline"
          >
            Delete artist
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>

        {deleteError && <p className="text-sm text-red-600">Delete failed: {deleteError}</p>}
      </form>
    </section>
  );
}
