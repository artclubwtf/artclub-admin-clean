import Link from "next/link";

type Brand = {
  key: "artclub" | "alea";
  displayName: string;
  tone?: string;
  about?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
};

async function loadBrands(): Promise<Brand[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/brands`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.brands) ? (json.brands as Brand[]) : [];
}

export default async function BrandsPage() {
  const brands = await loadBrands();

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brands</h1>
          <p className="text-sm text-slate-600">Manage tone, defaults, and assets for ARTCLUB and ALÉA.</p>
        </div>
      </header>

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
        {brands.length === 0 && <p className="text-sm text-slate-600">No brands found.</p>}
      </div>
    </main>
  );
}
