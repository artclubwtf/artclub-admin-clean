"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Artist = {
  _id: string;
  name: string;
  email?: string;
  status?: string;
  tags?: string[];
  notes?: string;
};

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

export default function ArtistsPageClient() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/artists", { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        const normalized = Array.isArray(json.data) ? json.data.map(normalizeArtist) : [];
        setArtists(normalized);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load artists");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError("Name is required");
      return;
    }

    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }

      const json = await res.json();
      setArtists((prev) => [normalizeArtist(json.data), ...prev]);
      setName("");
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create artist");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
          <label className="text-sm font-medium w-24">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Artist name"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 sm:mt-0"
          />
        </div>

        {createError && <p className="text-sm text-red-600">{createError}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Artist"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">All artists</h2>
          {loading && <span className="text-sm text-slate-500">Loading...</span>}
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600">
            Failed to load artists: {error}
          </p>
        )}

        {!loading && !error && artists.length === 0 && (
          <p className="mt-2 text-sm text-slate-600">No artists yet.</p>
        )}

        <ul className="mt-4 grid gap-3">
          {artists.map((artist) => (
            <li
              key={artist._id}
              className="rounded border border-slate-200 px-4 py-3 hover:border-slate-300"
            >
              <Link href={`/admin/artists/${artist._id}`} className="block">
                <div className="font-medium">{artist.name}</div>
                <div className="text-xs text-slate-500">{artist._id}</div>
                {artist.status && (
                  <div className="mt-1 text-xs text-slate-600">Status: {artist.status}</div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
