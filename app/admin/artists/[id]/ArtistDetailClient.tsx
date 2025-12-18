"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShopifyKuenstler } from "@/lib/shopify";

type Props = {
  artistId: string;
};

type ArtistProduct = {
  id: string;
  title: string;
  handle: string;
  featuredImage: string | null;
};

function parseErrorMessage(payload: any) {
  if (!payload) return "Unexpected error";
  if (typeof payload === "string") return payload;
  if (payload.error) {
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
  }
  return "Unexpected error";
}

export default function ArtistDetailClient({ artistId }: Props) {
  const [artist, setArtist] = useState<ShopifyKuenstler | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [quote, setQuote] = useState("");
  const [einleitung1, setEinleitung1] = useState("");
  const [text1, setText1] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<ArtistProduct[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}`, { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        const data = json.artist as ShopifyKuenstler;
        setArtist(data);
        setName(data.name ?? "");
        setInstagram(data.instagram ?? "");
        setQuote(data.quote ?? "");
        setEinleitung1(data.einleitung_1 ?? "");
        setText1(data.text_1 ?? "");
        setProducts(Array.isArray(json.products) ? json.products : []);
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

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          instagram: instagram.trim(),
          quote: quote.trim(),
          einleitung_1: einleitung1.trim(),
          text_1: text1.trim(),
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }

      const json = await res.json();
      const updated = json.artist as ShopifyKuenstler;
      setArtist(updated);
      setSaveMessage("Saved");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save artist");
    } finally {
      setSaving(false);
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

  const readonlyFields = [
    { label: "Handle", value: artist.handle },
    { label: "Bilder (file_reference)", value: artist.bilder },
    { label: "Bild 1 (file_reference)", value: artist.bild_1 },
    { label: "Bild 2 (file_reference)", value: artist.bild_2 },
    { label: "Bild 3 (file_reference)", value: artist.bild_3 },
    { label: "Kategorie", value: artist.kategorie },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">ID</div>
          <div className="font-mono text-sm text-slate-700 break-all">{artist.id}</div>
        </div>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Name"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Instagram
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="@handle"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Quote
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Quote"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Einleitung 1
          <textarea
            value={einleitung1}
            onChange={(e) => setEinleitung1(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Einleitung"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Text 1
          <textarea
            value={text1}
            onChange={(e) => setText1(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Text"
          />
        </label>

        {error && <p className="text-sm text-red-600">Error: {error}</p>}
        {saveMessage && <p className="text-sm text-green-600">{saveMessage}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Read-only fields</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {readonlyFields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="text-sm text-slate-700 break-all">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Products (Kategorie)</h3>
          {artist.kategorie && (
            <span className="text-xs text-slate-500">Collection: {artist.kategorie}</span>
          )}
        </div>
        {!artist.kategorie && <p className="text-sm text-slate-600">No category linked.</p>}
        {artist.kategorie && products.length === 0 && (
          <p className="text-sm text-slate-600">No products found for this category.</p>
        )}
        {artist.kategorie && products.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {products.map((product) => (
              <li key={product.id} className="flex gap-3 rounded border border-slate-200 p-3">
                {product.featuredImage && (
                  <img
                    src={product.featuredImage}
                    alt={product.title}
                    className="h-16 w-16 rounded object-cover"
                  />
                )}
                <div className="space-y-1">
                  <div className="font-medium">{product.title}</div>
                  <div className="text-xs text-slate-500">{product.handle}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
