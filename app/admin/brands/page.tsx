"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BrandKey = "artclub" | "alea";

type Brand = {
  key: BrandKey;
  displayName: string;
  tone?: string;
  about?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/brands", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load brands");
        if (!active) return;
        setBrands(Array.isArray(json?.brands) ? (json.brands as Brand[]) : []);
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load brands";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brands</h1>
          <p className="text-sm text-slate-600">Manage tone, defaults, and assets for ARTCLUB and ALÉA.</p>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-600">Loading brands...</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {brands.map((brand) => (
          <article key={brand.key} className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{brand.displayName}</h2>
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500">{brand.key}</p>
              </div>
              <Link
                href={`/admin/brands/${brand.key}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Edit
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {brand.tone && <p>{brand.tone}</p>}
              {brand.about && <p className="line-clamp-2">{brand.about}</p>}
            </div>
            <div className="mt-3 flex gap-3">
              {brand.logoLightUrl && (
                <img src={brand.logoLightUrl} alt={`${brand.displayName} light logo`} className="h-12 w-auto rounded bg-slate-50 p-2" />
              )}
              {brand.logoDarkUrl && (
                <img src={brand.logoDarkUrl} alt={`${brand.displayName} dark logo`} className="h-12 w-auto rounded bg-slate-800 p-2" />
              )}
            </div>
          </article>
        ))}
        {!loading && brands.length === 0 && <p className="text-sm text-slate-600">No brands found.</p>}
      </div>
    </main>
  );
}
