"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { renderMarkdownToHtml } from "@/lib/markdown";

type TermsDocument = {
  id: string;
  key: string;
  title: string;
  activeVersionId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type TermsVersion = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  effectiveAt?: string | null;
  changelog?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUserId?: string | null;
  content?: {
    summaryMarkdown?: string;
    fullMarkdown?: string;
    blocks?: unknown[];
  };
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminTermsEditorPage() {
  const params = useParams();
  const keyParam = params?.key;
  const key = Array.isArray(keyParam) ? keyParam[0] : keyParam || "";

  const [document, setDocument] = useState<TermsDocument | null>(null);
  const [versions, setVersions] = useState<TermsVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summaryMarkdown, setSummaryMarkdown] = useState("");
  const [fullMarkdown, setFullMarkdown] = useState("");
  const [changelog, setChangelog] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/terms/${encodeURIComponent(key)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as
        | { document?: TermsDocument; versions?: TermsVersion[]; error?: string }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load terms document");
      const doc = payload?.document || null;
      const list = Array.isArray(payload?.versions) ? payload.versions : [];
      setDocument(doc);
      setVersions(list);

      const draft = list.find((item) => item.status === "draft") || null;
      const active = doc?.activeVersionId ? list.find((item) => item.id === doc.activeVersionId) || null : null;
      const base = draft || active;
      setSummaryMarkdown(base?.content?.summaryMarkdown || "");
      setFullMarkdown(base?.content?.fullMarkdown || "");
      setActionMessage(null);
      setActionError(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load terms document");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const draftVersion = useMemo(() => versions.find((item) => item.status === "draft") || null, [versions]);
  const maxVersion = useMemo(
    () => versions.reduce((acc, item) => (item.version > acc ? item.version : acc), 0),
    [versions],
  );
  const nextVersion = maxVersion ? maxVersion + 1 : 1;
  const activeVersion = useMemo(
    () => (document?.activeVersionId ? versions.find((item) => item.id === document.activeVersionId) || null : null),
    [document?.activeVersionId, versions],
  );

  const summaryHtml = useMemo(() => renderMarkdownToHtml(summaryMarkdown), [summaryMarkdown]);
  const fullHtml = useMemo(() => renderMarkdownToHtml(fullMarkdown), [fullMarkdown]);

  const handleSave = async () => {
    if (!key) return;
    setSaving(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/terms/${encodeURIComponent(key)}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryMarkdown,
          fullMarkdown,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to save draft");
      setActionMessage("Draft saved.");
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!key) return;
    const trimmed = changelog.trim();
    if (!trimmed) {
      setActionError("Changelog is required to publish.");
      return;
    }
    setPublishing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/terms/${encodeURIComponent(key)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changelog: trimmed }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; version?: { version?: number } } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to publish terms");
      setActionMessage(`Published v${payload?.version?.version ?? ""}.`);
      setChangelog("");
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to publish terms");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <main className="admin-dashboard">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{document?.title || "Terms"}</h1>
          <p className="text-sm text-slate-600">{document?.key || key}</p>
        </div>
        <div className="text-xs text-slate-500">
          Active: {activeVersion ? `v${activeVersion.version} · ${formatDate(activeVersion.effectiveAt)}` : "—"}
        </div>
      </header>

      {error && <div className="card text-red-600">Error: {error}</div>}
      {actionError && <div className="card text-red-600">Action error: {actionError}</div>}
      {actionMessage && <div className="card text-emerald-700">{actionMessage}</div>}

      {loading ? <div className="card">Loading terms...</div> : null}

      {!loading ? (
        <>
          <div className="acGrid2">
            <div className="card space-y-4">
              <div className="cardHeader">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Draft editor</div>
                  <div className="text-sm text-slate-600">
                    {draftVersion ? `Draft v${draftVersion.version}` : `No draft yet · Next v${nextVersion}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btnGhost" onClick={load} disabled={loading || saving || publishing}>
                    Reload
                  </button>
                  <button type="button" className="btnPrimary" onClick={handleSave} disabled={saving || publishing}>
                    {saving ? "Saving..." : "Save draft"}
                  </button>
                </div>
              </div>

              {!draftVersion ? (
                <div className="text-xs text-slate-500">
                  Edits will create a new draft version. Save draft before publishing.
                </div>
              ) : null}

              <label className="text-sm font-semibold text-slate-900">
                Summary markdown
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  rows={6}
                  value={summaryMarkdown}
                  onChange={(event) => setSummaryMarkdown(event.target.value)}
                  placeholder="Short summary shown before the full terms."
                />
              </label>

              <label className="text-sm font-semibold text-slate-900">
                Full markdown
                <textarea
                  className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  rows={16}
                  value={fullMarkdown}
                  onChange={(event) => setFullMarkdown(event.target.value)}
                  placeholder="Full terms text."
                />
              </label>
            </div>

            <div className="card space-y-4">
              <div className="cardHeader">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Live preview</div>
                  <div className="text-sm text-slate-600">Markdown rendering preview.</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Summary</div>
                {summaryHtml ? (
                  <div className="mt-3 md-preview" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
                ) : (
                  <div className="mt-3 text-sm text-slate-500">No summary content yet.</div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Full terms</div>
                {fullHtml ? (
                  <div className="mt-3 md-preview" dangerouslySetInnerHTML={{ __html: fullHtml }} />
                ) : (
                  <div className="mt-3 text-sm text-slate-500">No full content yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="cardHeader">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Publish</div>
                <div className="text-sm text-slate-600">Publishing archives the previous active version.</div>
              </div>
              <button
                type="button"
                className="btnPrimary"
                onClick={handlePublish}
                disabled={publishing || !draftVersion}
                title={!draftVersion ? "Save a draft before publishing." : undefined}
              >
                {publishing ? "Publishing..." : "Publish new version"}
              </button>
            </div>

            <label className="text-sm font-semibold text-slate-900">
              Changelog (required)
              <textarea
                className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={changelog}
                onChange={(event) => setChangelog(event.target.value)}
                placeholder="Describe what changed in this version."
              />
            </label>
          </div>

          <div className="card space-y-3">
            <div className="cardHeader">
              <h2 className="text-lg font-semibold">Version history</h2>
              <span className="text-xs text-slate-500">{versions.length} total</span>
            </div>

            {versions.length === 0 ? <p className="text-sm text-slate-600">No versions yet.</p> : null}

            <ul className="grid gap-3">
              {versions.map((version) => {
                const isActive = document?.activeVersionId === version.id;
                return (
                  <li key={version.id} className="rounded border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">v{version.version}</div>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{version.status}</span>
                        {isActive ? <span className="text-xs font-semibold text-emerald-700">Active</span> : null}
                      </div>
                      <div className="text-xs text-slate-500">Created {formatDate(version.createdAt)}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Effective {formatDate(version.effectiveAt)} · Updated {formatDate(version.updatedAt)}
                    </div>
                    {version.changelog ? (
                      <div className="mt-2 text-sm text-slate-700">{version.changelog}</div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">No changelog.</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}
    </main>
  );
}
