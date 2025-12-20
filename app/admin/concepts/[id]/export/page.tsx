import { Types } from "mongoose";
import type { Metadata } from "next";

import { connectMongo } from "@/lib/mongodb";
import { ConceptModel } from "@/models/Concept";
import { BrandSettingsModel } from "@/models/BrandSettings";

type PageProps = {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { theme?: string } | Promise<{ theme?: string }>;
};

type Brand = {
  key: "artclub" | "alea";
  displayName: string;
  tone?: string;
  about?: string;
  colors?: { accent?: string; background?: string; text?: string };
  typography?: { fontFamily?: string };
  logoLightUrl?: string;
  logoDarkUrl?: string;
};

type Concept = {
  _id: string;
  title: string;
  brandKey: "artclub" | "alea";
  type: string;
  granularity: string;
  status: string;
  sections?: {
    goalContext?: string;
    targetAudience?: string;
    narrative?: string;
    kpis?: string;
    legal?: string;
  };
  references?: {
    artists?: Array<{ source: "mongo" | "shopify"; id: string; label?: string }>;
    artworks?: Array<{ productId: string; label?: string }>;
  };
  assets?: Array<{
    kind: "s3" | "shopify_file" | "url";
    id?: string;
    url?: string;
    previewUrl?: string;
    label?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export const metadata: Metadata = {
  title: "Concept Export",
};

function pickFirstImage(assets: Concept["assets"]): string | null {
  if (!assets) return null;
  for (const asset of assets) {
    if (asset.url) return asset.url;
    if (asset.previewUrl) return asset.previewUrl;
  }
  return null;
}

export default async function ConceptExportPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearch = (await searchParams) || {};
  const theme = resolvedSearch.theme === "dark" ? "dark" : "light";

  if (!Types.ObjectId.isValid(resolvedParams.id)) {
    return (
      <main className="p-8">
        <p className="text-sm text-slate-600">Concept not found.</p>
      </main>
    );
  }

  await connectMongo();
  const conceptDoc = await ConceptModel.findById(resolvedParams.id).lean();
  if (!conceptDoc) {
    return (
      <main className="p-8">
        <p className="text-sm text-slate-600">Concept not found.</p>
      </main>
    );
  }

  const concept: Concept = {
    ...conceptDoc,
    _id: conceptDoc._id.toString(),
    createdAt: conceptDoc.createdAt ? new Date(conceptDoc.createdAt).toISOString() : undefined,
    updatedAt: conceptDoc.updatedAt ? new Date(conceptDoc.updatedAt).toISOString() : undefined,
  };
  const brandDoc = await BrandSettingsModel.findOne({ key: concept.brandKey }).lean();
  const brand = (brandDoc || null) as Brand | null;

  const heroImage = pickFirstImage(concept.assets);
  const accent = brand?.colors?.accent || "#111827";
  const background = brand?.colors?.background || "#f8fafc";
  const text = brand?.colors?.text || "#0f172a";
  const fontFamily = brand?.typography?.fontFamily || '"SF Pro Display", "Inter", system-ui, sans-serif';
  const today = new Date(concept.updatedAt || concept.createdAt || Date.now()).toLocaleDateString();

  return (
    <div className={`print-export ${theme}`}>
      <style>{printStyles({ accent, background, text, fontFamily, theme })}</style>
      <main className="export-shell">
        <section className="page cover">
          <div className="cover-header">
            <div className="brand-block">
              {brand?.logoLightUrl || brand?.logoDarkUrl ? (
                <img
                  src={theme === "dark" ? brand?.logoDarkUrl || brand?.logoLightUrl! : brand?.logoLightUrl || brand?.logoDarkUrl!}
                  alt={brand?.displayName || concept.brandKey}
                  className="brand-logo"
                />
              ) : (
                <div className="brand-placeholder">{brand?.displayName || concept.brandKey}</div>
              )}
              <p className="brand-sub">{brand?.tone || "Brand Proposal"}</p>
            </div>
            <div className="cover-meta">
              <p className="eyebrow">Concept</p>
              <h1 className="cover-title">{concept.title}</h1>
              <p className="cover-subtitle">
                {concept.type} • {concept.granularity} • {today}
              </p>
            </div>
          </div>
          {heroImage && <img src={heroImage} alt="Hero" className="hero" />}
        </section>

        <SectionPage title="Goal & Context">
          <p>{concept.sections?.goalContext || "No content provided."}</p>
          <p>{concept.sections?.targetAudience || ""}</p>
        </SectionPage>

        <SectionPage title="Narrative">
          <p>{concept.sections?.narrative || "No narrative provided."}</p>
        </SectionPage>

        <SectionPage title="KPIs">
          <p>{concept.sections?.kpis || "No KPIs provided."}</p>
        </SectionPage>

        <SectionPage title="Legal & Notes">
          <p>{concept.sections?.legal || "No legal notes provided."}</p>
        </SectionPage>

        <SectionPage title="Included Artists">
          {concept.references?.artists?.length ? (
            <ul className="pill-list">
              {concept.references.artists.map((a) => (
                <li key={`${a.source}-${a.id}`} className="pill">
                  {a.label || a.id} <span className="pill-sub">{a.source}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No artists attached.</p>
          )}
        </SectionPage>

        <SectionPage title="Artworks">
          {concept.references?.artworks?.length ? (
            <ul className="pill-list">
              {concept.references.artworks.map((a) => (
                <li key={a.productId} className="pill">
                  {a.label || a.productId}
                </li>
              ))}
            </ul>
          ) : (
            <p>No artworks attached.</p>
          )}
        </SectionPage>

        {concept.assets?.length ? (
          <SectionPage title="Assets">
            <div className="asset-grid">
              {concept.assets
                .filter((a) => a.url || a.previewUrl)
                .map((a, idx) => (
                  <figure key={idx} className="asset-card">
                    {a.url || a.previewUrl ? (
                      <img src={a.url || a.previewUrl} alt={a.label || "Asset"} />
                    ) : (
                      <div className="asset-placeholder" />
                    )}
                    <figcaption>{a.label || a.url || a.id}</figcaption>
                  </figure>
                ))}
            </div>
          </SectionPage>
        ) : null}
      </main>
    </div>
  );
}

function SectionPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="page">
      <header className="section-header">
        <h2>{title}</h2>
        <div className="divider" />
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

function printStyles({
  accent,
  background,
  text,
  fontFamily,
  theme,
}: {
  accent: string;
  background: string;
  text: string;
  fontFamily: string;
  theme: string;
}) {
  return `
  @page {
    margin: 18mm;
    size: A4;
  }
  * { box-sizing: border-box; }
  :global(.admin-shell) { display: none !important; }
  :global(body) { margin: 0; background: ${background}; color: ${text}; font-family: ${fontFamily}; }
  :global(body.dark) { background: #0f172a; color: #e5e7eb; }
  .print-export {
    background: ${background};
    color: ${text};
    font-family: ${fontFamily};
  }
  .print-export.dark {
    background: #0f172a;
    color: #e5e7eb;
  }
  .export-shell {
    width: 100%;
    min-height: 100vh;
  }
  .page {
    width: 100%;
    min-height: calc(297mm - 36mm);
    padding: 28mm 20mm 24mm;
    page-break-after: always;
    position: relative;
  }
  .page:last-child { page-break-after: auto; }
  .cover { display: flex; flex-direction: column; gap: 18mm; }
  .cover-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
  .brand-block { display: flex; flex-direction: column; gap: 6px; }
  .brand-logo { max-height: 60px; width: auto; object-fit: contain; }
  .brand-placeholder { padding: 10px 14px; border: 1px solid rgba(0,0,0,0.1); border-radius: 10px; font-weight: 600; }
  .brand-sub { font-size: 12px; color: rgba(15,23,42,0.7); }
  .eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: ${accent}; }
  .cover-title { font-size: 34px; line-height: 1.1; margin: 6px 0; }
  .cover-subtitle { font-size: 14px; color: rgba(15,23,42,0.7); }
  .hero { width: 100%; height: 220px; object-fit: cover; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.12); }
  .section-header { margin-bottom: 12px; }
  .section-header h2 { margin: 0; font-size: 20px; color: ${accent}; }
  .divider { height: 1px; background: rgba(15,23,42,0.1); margin-top: 8px; }
  .section-body { font-size: 14px; line-height: 1.6; display: grid; gap: 10px; }
  .pill-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .pill { background: rgba(15,23,42,0.06); border-radius: 9999px; padding: 8px 12px; font-size: 12px; display: inline-flex; gap: 6px; align-items: center; }
  .pill-sub { font-size: 11px; color: rgba(15,23,42,0.6); }
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .asset-card { border: 1px solid rgba(15,23,42,0.08); border-radius: 10px; overflow: hidden; background: white; }
  .asset-card img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .asset-card figcaption { padding: 8px 10px; font-size: 12px; color: rgba(15,23,42,0.8); }
  .asset-placeholder { height: 120px; background: rgba(15,23,42,0.05); }
  footer { position: fixed; bottom: 12mm; left: 20mm; right: 20mm; font-size: 11px; color: rgba(15,23,42,0.6); display: flex; justify-content: space-between; }
  footer .page-num::before { counter-increment: page; content: counter(page); }
  @media print {
    body.print-export { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { box-shadow: none; }
  }
  `;
}
