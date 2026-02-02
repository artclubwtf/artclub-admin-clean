"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BrandKey = "artclub" | "alea";

type Brand = {
  key: BrandKey;
  displayName: string;
  tone?: string;
  about?: string;
  defaultOfferBullets?: string[];
  colors?: { accent?: string; background?: string; text?: string };
  typography?: { fontFamily?: string };
  logoLightUrl?: string;
  logoDarkUrl?: string;
};

type Props = {
  brandKey: BrandKey;
};

export default function BrandDetailClient({ brandKey }: Props) {
  const router = useRouter();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"light" | "dark" | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [tone, setTone] = useState("");
  const [about, setAbout] = useState("");
  const [bullets, setBullets] = useState<string[]>([]);
  const [colors, setColors] = useState<{ accent?: string; background?: string; text?: string }>({});
  const [fontFamily, setFontFamily] = useState("");
  const [logoLightUrl, setLogoLightUrl] = useState("");
  const [logoDarkUrl, setLogoDarkUrl] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/brands/${brandKey}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load brand");
        if (!active) return;
        const b = json?.brand as Brand;
        setBrand(b);
        setDisplayName(b.displayName || "");
        setTone(b.tone || "");
        setAbout(b.about || "");
        setBullets(Array.isArray(b.defaultOfferBullets) ? b.defaultOfferBullets : []);
        setColors(b.colors || {});
        setFontFamily(b.typography?.fontFamily || "");
        setLogoLightUrl(b.logoLightUrl || "");
        setLogoDarkUrl(b.logoDarkUrl || "");
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load brand";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [brandKey]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          tone,
          about,
          defaultOfferBullets: bullets,
          colors,
          typography: { fontFamily },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to save brand");
      setBrand(json?.brand || null);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save brand";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (variant: "light" | "dark", file: File) => {
    setUploading(variant);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("variant", variant);
      const res = await fetch(`/api/brands/${brandKey}/logo`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Upload failed");
      if (variant === "light") {
        setLogoLightUrl(json?.url || "");
      } else {
        setLogoDarkUrl(json?.url || "");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setUploading(null);
    }
  };

  const updateBullet = (idx: number, value: string) => {
    setBullets((prev) => prev.map((b, i) => (i === idx ? value : b)));
  };

  const addBullet = () => setBullets((prev) => [...prev, ""]);
  const removeBullet = (idx: number) => setBullets((prev) => prev.filter((_, i) => i !== idx));
  const moveBullet = (idx: number, delta: number) => {
    setBullets((prev) => {
      const next = [...prev];
      const newIndex = idx + delta;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const [item] = next.splice(idx, 1);
      next.splice(newIndex, 0, item);
      return next;
    });
  };

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-600">Loading brand...</p>
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
          disabled={saving}
        >
          Retry
        </button>
      </main>
    );
  }

  if (!brand) {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-600">Brand not found.</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
        <section className="space-y-5 rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-slate-500">{brand.key}</p>
              <h1 className="text-2xl font-semibold">{displayName}</h1>
            </div>
            <button
              type="button"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </header>

          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">Identity</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Display Name">
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </Field>
                <Field label="Tone">
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="About">
                <textarea
                  className="min-h-[100px] w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                />
              </Field>
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">Defaults</h2>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Offer Bullets</label>
                <div className="space-y-2">
                  {bullets.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={b}
                        onChange={(e) => updateBullet(idx, e.target.value)}
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 py-2 text-xs"
                          onClick={() => moveBullet(idx, -1)}
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 px-2 py-2 text-xs"
                          onClick={() => moveBullet(idx, 1)}
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-2 text-xs text-red-600"
                          onClick={() => removeBullet(idx)}
                          aria-label="Remove"
                        >
                          x
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50"
                    onClick={addBullet}
                  >
                    + Add bullet
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Visual System</h2>
                <Field label="Accent color">
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={colors.accent || ""}
                    onChange={(e) => setColors((prev) => ({ ...prev, accent: e.target.value }))}
                    placeholder="#111827"
                  />
                </Field>
                <Field label="Background color">
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={colors.background || ""}
                    onChange={(e) => setColors((prev) => ({ ...prev, background: e.target.value }))}
                    placeholder="#ffffff"
                  />
                </Field>
                <Field label="Text color">
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={colors.text || ""}
                    onChange={(e) => setColors((prev) => ({ ...prev, text: e.target.value }))}
                    placeholder="#0f172a"
                  />
                </Field>
                <Field label="Font family">
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    placeholder='"SF Pro Text", "Inter", sans-serif'
                  />
                </Field>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">Logos</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <LogoUpload
                    label="Light logo"
                    url={logoLightUrl}
                    variant="light"
                    uploading={uploading === "light"}
                    onUpload={handleUpload}
                  />
                  <LogoUpload
                    label="Dark logo"
                    url={logoDarkUrl}
                    variant="dark"
                    uploading={uploading === "dark"}
                    onUpload={handleUpload}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Preview</h2>
          <div
            className="rounded-xl p-4 shadow-sm"
            style={{
              background: colors.background || "#f8fafc",
              color: colors.text || "#0f172a",
              fontFamily: fontFamily || undefined,
              border: "1px solid rgba(15, 23, 42, 0.08)",
            }}
          >
            <div className="flex items-center gap-3">
              {logoLightUrl ? (
                <img src={logoLightUrl} alt="logo" className="h-10 w-auto rounded bg-white/70 p-2" />
              ) : (
                <div className="h-10 w-28 rounded bg-white/60 text-xs text-slate-500 flex items-center justify-center">Logo</div>
              )}
              <div>
                <p className="text-xs uppercase tracking-[0.08em]" style={{ color: colors.accent || "#111827" }}>
                  {displayName}
                </p>
                <p className="text-sm font-semibold">{tone || "Tone preview"}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="text-lg font-semibold" style={{ color: colors.accent || "#111827" }}>
                Concept snapshot
              </h3>
              <p className="text-sm opacity-80">{about || "About text preview."}</p>
              <ul className="space-y-1 text-sm">
                {(bullets.length ? bullets : ["Default bullet one", "Default bullet two", "Default bullet three"]).map((b, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: colors.accent || "#111827" }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}

function LogoUpload({
  label,
  url,
  variant,
  uploading,
  onUpload,
}: {
  label: string;
  url?: string;
  variant: "light" | "dark";
  uploading: boolean;
  onUpload: (variant: "light" | "dark", file: File) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex items-center gap-3">
        {url ? (
          <img src={url} alt={label} className="h-12 w-auto rounded border border-slate-200 bg-white p-2" />
        ) : (
          <div className="flex h-12 w-20 items-center justify-center rounded border border-dashed border-slate-200 text-xs text-slate-500">
            None
          </div>
        )}
        <label className="rounded border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 cursor-pointer">
          {uploading ? "Uploading..." : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(variant, file);
              e.target.value = "";
            }}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
}
