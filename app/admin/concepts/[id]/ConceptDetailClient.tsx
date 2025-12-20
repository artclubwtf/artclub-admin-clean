"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ConceptStatus = "draft" | "internal_review" | "ready_to_send" | "sent" | "won" | "lost";
type ConceptGranularity = "short" | "standard" | "detailed";
type ArtistSource = "mongo" | "shopify";

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
  references?: {
    artists?: ArtistReference[];
    artworks?: ArtworkReference[];
  };
  assets?: ConceptAsset[];
  notes?: string;
  exports?: {
    proposalMarkdown?: string;
    emailDraftText?: string;
    provider?: "local" | "openai";
  };
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

type ArtistReference = { source: ArtistSource; id: string; label?: string };
type ArtworkReference = { productId: string; label?: string };
type ConceptAsset = {
  kind: "s3" | "shopify_file" | "url";
  id?: string;
  url?: string;
  mimeType?: string;
  label?: string;
  previewUrl?: string;
};

type DbArtist = {
  _id: string;
  name: string;
};

type ShopifyArtist = {
  metaobjectId: string;
  displayName?: string | null;
  handle?: string | null;
};

type ShopifyProduct = {
  id: string;
  title: string;
  imageUrl?: string | null;
  firstVariantPrice?: string | null;
};

type MediaItem = {
  _id: string;
  filename?: string;
  url?: string;
  mimeType?: string;
};

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
  const [artistRefs, setArtistRefs] = useState<ArtistReference[]>([]);
  const [artworkRefs, setArtworkRefs] = useState<ArtworkReference[]>([]);
  const [assets, setAssets] = useState<ConceptAsset[]>([]);
  const [proposalMarkdown, setProposalMarkdown] = useState("");
  const [emailDraftText, setEmailDraftText] = useState("");

  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [artistSearch, setArtistSearch] = useState("");
  const [dbArtists, setDbArtists] = useState<DbArtist[]>([]);
  const [shopifyArtists, setShopifyArtists] = useState<ShopifyArtist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsError, setArtistsError] = useState<string | null>(null);
  const [artworks, setArtworks] = useState<ShopifyProduct[]>([]);
  const [artworksLoading, setArtworksLoading] = useState(false);
  const [artworksError, setArtworksError] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [fileUploadSuccess, setFileUploadSuccess] = useState<string | null>(null);
  const [selectedShopifyArtistId, setSelectedShopifyArtistId] = useState<string>("");
  const [selectedDbArtistId, setSelectedDbArtistId] = useState<string>("");
  const [brandAbout, setBrandAbout] = useState<string>("");

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
        setArtistRefs(Array.isArray(data.references?.artists) ? data.references!.artists : []);
        setArtworkRefs(Array.isArray(data.references?.artworks) ? data.references!.artworks : []);
        setAssets(Array.isArray(data.assets) ? data.assets : []);
        setProposalMarkdown(data.exports?.proposalMarkdown || "");
        setEmailDraftText(data.exports?.emailDraftText || "");
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

  useEffect(() => {
    let active = true;
    const loadArtists = async () => {
      setArtistsLoading(true);
      setArtistsError(null);
      try {
        const [dbRes, shopifyRes] = await Promise.all([
          fetch(`/api/artists${artistSearch.trim() ? `?q=${encodeURIComponent(artistSearch.trim())}` : ""}`, {
            cache: "no-store",
          }),
          fetch("/api/shopify/artists", { cache: "no-store" }),
        ]);
        const [dbJson, shopifyJson] = await Promise.all([dbRes.json().catch(() => null), shopifyRes.json().catch(() => null)]);
        if (!dbRes.ok) throw new Error(dbJson?.error || "Failed to load database artists");
        if (!shopifyRes.ok) throw new Error(shopifyJson?.error || "Failed to load Shopify artists");
        if (!active) return;
        setDbArtists(Array.isArray(dbJson?.artists) ? dbJson.artists.map((a: any) => ({ _id: a._id, name: a.name })) : []);
        setShopifyArtists(
          Array.isArray(shopifyJson?.artists)
            ? shopifyJson.artists.map((a: any) => ({
                metaobjectId: a.metaobjectId,
                displayName: a.displayName || a.handle,
                handle: a.handle,
              }))
            : [],
        );
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load artists";
        setArtistsError(message);
      } finally {
        if (active) setArtistsLoading(false);
      }
    };
    loadArtists();
    return () => {
      active = false;
    };
  }, [artistSearch]);

  useEffect(() => {
    let active = true;
    const loadBrands = async () => {
      try {
        const res = await fetch("/api/brands", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) return;
        const brands = Array.isArray(json?.brands) ? json.brands : [];
        const found = brands.find((b: any) => b.key === concept?.brandKey);
        if (active && found?.about) {
          setBrandAbout(found.about);
        }
      } catch {
        // ignore brand load errors to keep export working with defaults
      }
    };
    loadBrands();
    return () => {
      active = false;
    };
  }, [concept?.brandKey]);

  useEffect(() => {
    const firstShopify = artistRefs.find((a) => a.source === "shopify");
    if (firstShopify) {
      setSelectedShopifyArtistId((prev) => prev || firstShopify.id);
    } else {
      setSelectedShopifyArtistId("");
    }
    const firstDb = artistRefs.find((a) => a.source === "mongo");
    if (firstDb) {
      setSelectedDbArtistId((prev) => prev || firstDb.id);
    } else {
      setSelectedDbArtistId("");
    }
  }, [artistRefs]);

  const statusLabel = useMemo(() => status.replace(/_/g, " "), [status]);

  const buildProposalMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# ${title || "Concept"}`);
    if (brandAbout) {
      lines.push("", `## About`, brandAbout.trim());
    }
    lines.push("", `## Sections`);
    if (sections.goalContext) lines.push(`- **Goal / Context:** ${sections.goalContext}`);
    if (sections.targetAudience) lines.push(`- **Target Audience:** ${sections.targetAudience}`);
    if (sections.narrative) lines.push(`- **Narrative:** ${sections.narrative}`);
    if (sections.kpis) lines.push(`- **KPIs:** ${sections.kpis}`);
    if (sections.legal) lines.push(`- **Legal:** ${sections.legal}`);

    lines.push("", `## Included Artists`);
    if (artistRefs.length === 0) {
      lines.push("- None");
    } else {
      artistRefs.forEach((a) => lines.push(`- ${a.label || a.id} (${a.source})`));
    }

    lines.push("", `## Included Artworks`);
    if (artworkRefs.length === 0) {
      lines.push("- None");
    } else {
      artworkRefs.forEach((a) => lines.push(`- ${a.label || a.productId}`));
    }

    lines.push("", `## Assets`);
    if (assets.length === 0) {
      lines.push("- None");
    } else {
      assets.forEach((a) => {
        const label = a.label || a.url || a.id || a.kind;
        lines.push(`- ${label}${a.url ? ` (${a.url})` : ""}`);
      });
    }

    return lines.join("\n");
  };

  const buildEmailDraft = () => {
    const summary = [
      sections.goalContext ? `Goal: ${sections.goalContext}` : null,
      sections.targetAudience ? `Audience: ${sections.targetAudience}` : null,
      sections.kpis ? `KPIs: ${sections.kpis}` : null,
      artistRefs.length ? `Artists: ${artistRefs.map((a) => a.label || a.id).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n- ");

    const subject = `${title || "New Concept"} - ${concept?.brandKey || ""}`.trim();
    const bodyLines = [
      `Subject: ${subject}`,
      "",
      "Hi team,",
      "",
      `Here's the latest concept draft for ${concept?.brandKey || "the brand"}.`,
      "",
      "Summary:",
      summary ? `- ${summary}` : "- Draft in progress",
      "",
      "Preview assets:",
      assets.length ? assets.map((a) => `- ${a.label || a.url || a.id}`).join("\n") : "- None yet",
      "",
      "CTA: Can you review and share feedback by EOD?",
      "",
      "Thanks,",
    ];

    return bodyLines.join("\n");
  };

  const saveExports = async (nextExports: { proposalMarkdown?: string; emailDraftText?: string }) => {
    try {
      const res = await fetch(`/api/concepts/${conceptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exports: { ...nextExports, provider: "local" },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save exports");
      }
      setProposalMarkdown(json?.concept?.exports?.proposalMarkdown || nextExports.proposalMarkdown || "");
      setEmailDraftText(json?.concept?.exports?.emailDraftText || nextExports.emailDraftText || "");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save exports";
      setError(message);
    }
  };

  const handleGenerateProposal = async () => {
    const draft = buildProposalMarkdown();
    setProposalMarkdown(draft);
    await saveExports({ proposalMarkdown: draft, emailDraftText });
  };

  const handleGenerateEmail = async () => {
    const draft = buildEmailDraft();
    setEmailDraftText(draft);
    await saveExports({ proposalMarkdown, emailDraftText: draft });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore copy failure
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([proposalMarkdown || buildProposalMarkdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "concept"}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filteredDbArtists = useMemo(() => {
    const query = artistSearch.trim().toLowerCase();
    if (!query) return dbArtists;
    return dbArtists.filter((a) => a.name.toLowerCase().includes(query));
  }, [dbArtists, artistSearch]);

  const filteredShopifyArtists = useMemo(() => {
    const query = artistSearch.trim().toLowerCase();
    if (!query) return shopifyArtists;
    return shopifyArtists.filter((a) => (a.displayName || a.handle || "").toLowerCase().includes(query));
  }, [shopifyArtists, artistSearch]);

  const addArtistRef = (ref: ArtistReference) => {
    setArtistRefs((prev) => {
      if (prev.some((a) => a.source === ref.source && a.id === ref.id)) return prev;
      return [...prev, ref];
    });
  };

  const removeArtistRef = (ref: ArtistReference) => {
    setArtistRefs((prev) => prev.filter((a) => !(a.source === ref.source && a.id === ref.id)));
  };

  const parseShopifyId = (gid: string) => {
    const parts = gid.split("/");
    return parts[parts.length - 1] || gid;
  };

  const addArtworkRef = (product: ShopifyProduct) => {
    const productId = parseShopifyId(product.id);
    setArtworkRefs((prev) => {
      if (prev.some((a) => a.productId === productId)) return prev;
      return [...prev, { productId, label: product.title }];
    });
  };

  const removeArtworkRef = (productId: string) => {
    setArtworkRefs((prev) => prev.filter((a) => a.productId !== productId));
  };

  const upsertAsset = (asset: ConceptAsset) => {
    setAssets((prev) => {
      const exists = prev.some((a) => a.kind === asset.kind && (asset.id ? a.id === asset.id : a.url && a.url === asset.url));
      if (exists) return prev;
      return [...prev, asset];
    });
  };

  const removeAsset = (predicate: (a: ConceptAsset) => boolean) => {
    setAssets((prev) => prev.filter((a) => !predicate(a)));
  };

  const toggleMediaAsset = (media: MediaItem) => {
    const exists = assets.some((a) => a.kind === "s3" && (a.id === media._id || a.previewUrl === media.url));
    if (exists) {
      removeAsset((a) => a.kind === "s3" && (a.id === media._id || a.previewUrl === media.url));
    } else {
      upsertAsset({
        kind: "s3",
        id: media._id,
        url: media.url,
        previewUrl: media.url,
        label: media.filename,
        mimeType: media.mimeType,
      });
    }
  };

  const loadArtworks = async () => {
    if (!selectedShopifyArtistId) return;
    setArtworksLoading(true);
    setArtworksError(null);
    try {
      const res = await fetch(
        `/api/shopify/products-by-artist?artistMetaobjectGid=${encodeURIComponent(selectedShopifyArtistId)}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load artworks");
      setArtworks(Array.isArray(json?.products) ? json.products : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load artworks";
      setArtworksError(message);
    } finally {
      setArtworksLoading(false);
    }
  };

  const loadMedia = async () => {
    if (!selectedDbArtistId) return;
    setMediaLoading(true);
    setMediaError(null);
    try {
      const res = await fetch(`/api/media?kunstlerId=${encodeURIComponent(selectedDbArtistId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load media");
      setMediaItems(Array.isArray(json?.media) ? json.media : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load media";
      setMediaError(message);
    } finally {
      setMediaLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setFileUploading(true);
    setFileUploadError(null);
    setFileUploadSuccess(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/shopify/files/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Upload failed");
      }
      const fileId = json?.fileIdGid;
      const url = json?.url;
      const filename = json?.filename || file.name;
      upsertAsset({
        kind: "shopify_file",
        id: typeof fileId === "string" ? fileId : undefined,
        url: typeof url === "string" ? url : undefined,
        previewUrl: typeof url === "string" ? url : undefined,
        label: filename,
      });
      setFileUploadSuccess(`Uploaded ${filename}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setFileUploadError(message);
    } finally {
      setFileUploading(false);
      setTimeout(() => {
        setFileUploadSuccess(null);
        setFileUploadError(null);
      }, 3500);
    }
  };

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
          references: {
            artists: artistRefs,
            artworks: artworkRefs,
          },
          assets,
          exports: {
            proposalMarkdown,
            emailDraftText,
            provider: "local",
          },
          notes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save");
      }
      setConcept(json?.concept || concept);
      setArtistRefs(Array.isArray(json?.concept?.references?.artists) ? json.concept.references.artists : artistRefs);
      setArtworkRefs(Array.isArray(json?.concept?.references?.artworks) ? json.concept.references.artworks : artworkRefs);
      setAssets(Array.isArray(json?.concept?.assets) ? json.concept.assets : assets);
      setProposalMarkdown(json?.concept?.exports?.proposalMarkdown || proposalMarkdown);
      setEmailDraftText(json?.concept?.exports?.emailDraftText || emailDraftText);
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
        <p className="text-sm text-slate-600">Loading concept...</p>
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
                  {concept.brandKey} - {concept.type}
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
                  Last updated {concept.updatedAt ? new Date(concept.updatedAt).toLocaleString() : "--"}
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
                Next: Content &gt;&gt;
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
                Next: Assets & References &gt;&gt;
              </button>
            </div>
          </div>

          <div
            id="concept-step-assets"
            className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assets & References</h2>
              <span className="text-xs text-slate-500">Connect artists, artworks, media, and uploads</span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Artists</p>
                    <p className="text-xs text-slate-500">Attach from database and Shopify</p>
                  </div>
                  {artistsLoading && <span className="text-xs text-slate-500">Loading...</span>}
                </div>
                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Search artists..."
                    value={artistSearch}
                    onChange={(e) => setArtistSearch(e.target.value)}
                  />
                  {artistsError && <p className="text-xs text-red-600">{artistsError}</p>}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Artists (Database)</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {filteredDbArtists.slice(0, 10).map((a) => (
                          <button
                            key={a._id}
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                            onClick={() => addArtistRef({ source: "mongo", id: a._id, label: a.name })}
                          >
                            + {a.name}
                          </button>
                        ))}
                        {filteredDbArtists.length === 0 && <span className="text-xs text-slate-500">No matches</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Artists (Shopify)</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {filteredShopifyArtists.slice(0, 10).map((a) => (
                          <button
                            key={a.metaobjectId}
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                            onClick={() =>
                              addArtistRef({
                                source: "shopify",
                                id: a.metaobjectId,
                                label: a.displayName || a.handle || a.metaobjectId,
                              })
                            }
                          >
                            + {a.displayName || a.handle || "Shopify artist"}
                          </button>
                        ))}
                        {filteredShopifyArtists.length === 0 && <span className="text-xs text-slate-500">No matches</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Attached</p>
                    <div className="flex flex-wrap gap-2">
                      {artistRefs.length === 0 && <span className="text-xs text-slate-500">None</span>}
                      {artistRefs.map((ref) => (
                        <span
                          key={`${ref.source}-${ref.id}`}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
                        >
                          {ref.label || ref.id}{" "}
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() => removeArtistRef(ref)}
                            aria-label="Remove artist"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Artworks (Shopify)</p>
                    <p className="text-xs text-slate-500">Load products for a selected Shopify artist</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      value={selectedShopifyArtistId}
                      onChange={(e) => setSelectedShopifyArtistId(e.target.value)}
                    >
                      <option value="">Select Shopify artist</option>
                      {artistRefs
                        .filter((a) => a.source === "shopify")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label || a.id}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-2 text-xs font-medium"
                      onClick={loadArtworks}
                      disabled={!selectedShopifyArtistId || artworksLoading}
                    >
                      {artworksLoading ? "Loading..." : "Load"}
                    </button>
                  </div>
                </div>
                {artworksError && <p className="text-xs text-red-600 mt-2">{artworksError}</p>}
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {artworks.map((p) => (
                      <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-xs space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-800">{p.title}</p>
                            {p.firstVariantPrice && <p className="text-slate-500">{p.firstVariantPrice}</p>}
                          </div>
                          {p.imageUrl && <img src={p.imageUrl} alt={p.title} className="h-12 w-12 rounded object-cover" />}
                        </div>
                        <button
                          type="button"
                          className="w-full rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                          onClick={() => addArtworkRef(p)}
                        >
                          Attach
                        </button>
                      </div>
                    ))}
                    {artworks.length === 0 && (
                      <p className="text-xs text-slate-500">Load a Shopify artist to view products.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">Attached artworks</p>
                    <div className="flex flex-wrap gap-2">
                      {artworkRefs.length === 0 && <span className="text-xs text-slate-500">None</span>}
                      {artworkRefs.map((a) => (
                        <span key={a.productId} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
                          {a.label || a.productId}
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() => removeArtworkRef(a.productId)}
                            aria-label="Remove artwork"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Media (S3)</p>
                    <p className="text-xs text-slate-500">Attach artist media as assets</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      value={selectedDbArtistId}
                      onChange={(e) => setSelectedDbArtistId(e.target.value)}
                    >
                      <option value="">Select DB artist</option>
                      {artistRefs
                        .filter((a) => a.source === "mongo")
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label || a.id}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-2 text-xs font-medium"
                      onClick={loadMedia}
                      disabled={!selectedDbArtistId || mediaLoading}
                    >
                      {mediaLoading ? "Loading..." : "Load"}
                    </button>
                  </div>
                </div>
                {mediaError && <p className="text-xs text-red-600">{mediaError}</p>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {mediaItems.map((m) => {
                    const attached = assets.some((a) => a.kind === "s3" && (a.id === m._id || a.previewUrl === m.url));
                    return (
                      <button
                        type="button"
                        key={m._id}
                        className={`group overflow-hidden rounded-lg border text-left text-xs shadow-sm transition ${
                          attached ? "border-green-400 ring-2 ring-green-100" : "border-slate-200 hover:border-slate-300"
                        }`}
                        onClick={() => toggleMediaAsset(m)}
                      >
                        {m.url ? <img src={m.url} alt={m.filename || "Media"} className="h-24 w-full object-cover" /> : <div className="h-24 w-full bg-slate-100" />}
                        <div className="p-2">
                          <p className="line-clamp-1 font-semibold">{m.filename || "Media"}</p>
                          <p className="text-[11px] text-slate-500">{attached ? "Attached" : "Tap to attach"}</p>
                        </div>
                      </button>
                    );
                  })}
                  {mediaItems.length === 0 && <p className="text-xs text-slate-500">Load media for a DB artist.</p>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Upload to Shopify Files</p>
                    <p className="text-xs text-slate-500">Brand images, slides, and assets</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                        e.target.value = "";
                      }}
                      disabled={fileUploading}
                    />
                    {fileUploading ? "Uploading..." : "Upload"}
                  </label>
                </div>
                {fileUploadError && <p className="text-xs text-red-600">{fileUploadError}</p>}
                {fileUploadSuccess && <p className="text-xs text-green-600">{fileUploadSuccess}</p>}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600">Attached uploads</p>
                  <div className="flex flex-wrap gap-2">
                    {assets.filter((a) => a.kind === "shopify_file").length === 0 && (
                      <span className="text-xs text-slate-500">None</span>
                    )}
                    {assets
                      .filter((a) => a.kind === "shopify_file")
                      .map((a, idx) => (
                        <span
                          key={`shopify-file-${a.id || idx}`}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
                        >
                          {a.label || a.id || "Shopify file"}
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() =>
                              removeAsset((asset) => asset.kind === "shopify_file" && asset.id === a.id && asset.label === a.label)
                            }
                            aria-label="Remove upload"
                          >
                            x
                          </button>
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save references & assets"}
              </button>
              <button
                type="button"
                className="text-sm text-blue-600 hover:underline"
                onClick={() => scrollToStep("export")}
              >
                Next: Export &gt;&gt;
              </button>
            </div>
          </div>

          <div
            id="concept-step-export"
            className="rounded-2xl bg-white/80 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Export</h2>
              <span className="text-xs text-slate-500">Generate locally without AI</span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Proposal Markdown</p>
                    <p className="text-xs text-slate-500">Builds from sections and references</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-1 text-xs font-medium"
                      onClick={handleGenerateProposal}
                    >
                      Generate (local)
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-1 text-xs font-medium"
                      onClick={() => copyToClipboard(proposalMarkdown || buildProposalMarkdown())}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-1 text-xs font-medium"
                      onClick={downloadMarkdown}
                    >
                      Download .md
                    </button>
                  </div>
                </div>
                <textarea
                  className="min-h-[200px] w-full rounded border border-slate-200 px-3 py-2 text-sm font-mono"
                  value={proposalMarkdown}
                  onChange={(e) => setProposalMarkdown(e.target.value)}
                />
              </div>

              <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Email Draft</p>
                    <p className="text-xs text-slate-500">Subject + body for outreach</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-1 text-xs font-medium"
                      onClick={handleGenerateEmail}
                    >
                      Generate (local)
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-1 text-xs font-medium"
                      onClick={() => copyToClipboard(emailDraftText || buildEmailDraft())}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <textarea
                  className="min-h-[200px] w-full rounded border border-slate-200 px-3 py-2 text-sm font-mono"
                  value={emailDraftText}
                  onChange={(e) => setEmailDraftText(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Provider: local | Last saved proposal length {proposalMarkdown.length} chars
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => saveExports({ proposalMarkdown, emailDraftText })}
              >
                Save exports
              </button>
            </div>
          </div>

          {statusSaving && <p className="text-xs text-slate-600">Updating status to {statusLabel}...</p>}
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
