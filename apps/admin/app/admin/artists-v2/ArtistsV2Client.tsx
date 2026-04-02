"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import MigrationMatchingClient from "../migration/MigrationMatchingClient";

type ArtistRow = {
  artistKey: string;
  displayName: string;
  publicSlug: string;
  email: string;
  canonicalStatus: string;
  migrationStatus: string;
  linkStatus: string;
  reviewStatus: string;
  linkedUser: {
    id: string;
    email: string;
    name: string;
    artistKey: string;
  } | null;
  syncStatus: {
    needsPush: boolean;
    lastPushAt: string | null;
    lastPullAt: string | null;
    lastError: string | null;
  };
  shopifyMetaobjectId: string;
  legacyArtistId: string;
  productCount: number;
  pendingReviewCount: number;
  publishedCount: number;
  printsEnabledCount: number;
  updatedAt: string | null;
};

type Props = {
  initialArtists: ArtistRow[];
};

type ActionState = {
  loading: boolean;
  error: string | null;
  message: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeTone(status: string) {
  switch (status) {
    case "linked":
    case "approved":
    case "published":
    case "assigned":
      return "bg-emerald-50 text-emerald-700";
    case "needs_review":
    case "pending_review":
    case "suggested":
      return "bg-amber-50 text-amber-700";
    case "imported_unlinked":
    case "imported_unmapped":
    case "unlinked":
    case "unassigned":
      return "bg-slate-100 text-slate-700";
    case "archived":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function ArtistsV2Client({ initialArtists }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionState, setActionState] = useState<ActionState>({ loading: false, error: null, message: null });

  const filteredArtists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return initialArtists.filter((artist) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          artist.displayName,
          artist.email,
          artist.artistKey,
          artist.publicSlug,
          artist.shopifyMetaobjectId,
          artist.legacyArtistId,
          artist.linkedUser?.email,
          artist.linkedUser?.name,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));

      if (!matchesQuery) return false;

      switch (statusFilter) {
        case "linked":
          return artist.linkStatus === "linked";
        case "imported":
          return artist.migrationStatus === "imported_unlinked";
        case "needs_review":
          return artist.reviewStatus === "needs_review" || artist.linkStatus === "needs_review";
        case "sync_needed":
          return artist.syncStatus.needsPush;
        case "has_legacy":
          return Boolean(artist.legacyArtistId);
        default:
          return true;
      }
    });
  }, [initialArtists, query, statusFilter]);

  const summary = useMemo(
    () => ({
      total: initialArtists.length,
      imported: initialArtists.filter((artist) => artist.migrationStatus === "imported_unlinked").length,
      linked: initialArtists.filter((artist) => artist.linkStatus === "linked").length,
      needsReview: initialArtists.filter((artist) => artist.reviewStatus === "needs_review" || artist.linkStatus === "needs_review").length,
      syncNeeded: initialArtists.filter((artist) => artist.syncStatus.needsPush).length,
    }),
    [initialArtists],
  );

  async function runAction(label: string, input: { url: string; body?: Record<string, unknown> }) {
    setActionState({ loading: true, error: null, message: null });
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body || {}),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; results?: Array<{ scope: string; importedCount?: number }>; importedCount?: number } | null;
      if (!res.ok) throw new Error(payload?.error || `${label} failed`);

      const summaryText =
        payload?.results?.length
          ? payload.results.map((result) => `${result.scope}: ${result.importedCount ?? 0}`).join(" · ")
          : payload?.importedCount != null
            ? `${payload.importedCount} items`
            : "Done";

      setActionState({ loading: false, error: null, message: `${label} completed. ${summaryText}` });
      router.refresh();
    } catch (error) {
      setActionState({
        loading: false,
        error: error instanceof Error ? error.message : `${label} failed`,
        message: null,
      });
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Operations</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={actionState.loading}
                onClick={() => runAction("Shopify import", { url: "/api/admin/sync/shopify/import", body: { scope: "all", limit: 100 } })}
              >
                Import from Shopify
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                disabled={actionState.loading}
                onClick={() => runAction("Legacy import", { url: "/api/admin/sync/legacy/import", body: { limit: 250 } })}
              >
                Import from Legacy
              </button>
              <a href="#matching-queue" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                Matching Queue
              </a>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                disabled={actionState.loading}
                onClick={() => runAction("Artist push", { url: "/api/admin/sync/shopify/push", body: { scope: "artists", limit: 50 } })}
              >
                Push Artists
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                disabled={actionState.loading}
                onClick={() => runAction("Product push", { url: "/api/admin/sync/shopify/push", body: { scope: "products", limit: 50 } })}
              >
                Push Products
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search artist, user, slug, ids"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status filter</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
              >
                <option value="all">All</option>
                <option value="linked">Linked</option>
                <option value="imported">Imported</option>
                <option value="needs_review">Needs review</option>
                <option value="sync_needed">Sync needed</option>
                <option value="has_legacy">Has legacy bridge</option>
              </select>
            </label>
          </div>
        </div>

        {actionState.error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionState.error}</div> : null}
        {actionState.message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionState.message}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Artists</div>
          <div className="mt-2 text-2xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Imported</div>
          <div className="mt-2 text-2xl font-semibold">{summary.imported}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Linked</div>
          <div className="mt-2 text-2xl font-semibold">{summary.linked}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Needs review</div>
          <div className="mt-2 text-2xl font-semibold">{summary.needsReview}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Sync needed</div>
          <div className="mt-2 text-2xl font-semibold">{summary.syncNeeded}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Canonical artist overview</h2>
          <p className="text-sm text-slate-600">Operational overview of canonical artists, linking state, review pressure and migration references.</p>
        </div>
        <div className="divide-y divide-slate-200">
          {filteredArtists.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">No artists match the current filters.</div>
          ) : null}
          {filteredArtists.map((artist) => (
            <Link
              key={artist.artistKey}
              href={`/admin/artists-v2/${encodeURIComponent(artist.artistKey)}`}
              className="block px-5 py-4 transition hover:bg-slate-50"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-slate-900">{artist.displayName}</div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(artist.canonicalStatus)}`}>{artist.canonicalStatus}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(artist.linkStatus)}`}>{artist.linkStatus}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(artist.reviewStatus)}`}>{artist.reviewStatus}</span>
                  </div>
                  <div className="text-sm text-slate-500">
                    {[artist.email, artist.publicSlug ? `/${artist.publicSlug}` : "", artist.artistKey].filter(Boolean).join(" · ")}
                  </div>
                  <div className="grid gap-1 text-xs text-slate-500 md:grid-cols-2">
                    <div>Linked user: {artist.linkedUser ? `${artist.linkedUser.name || artist.linkedUser.email} (${artist.linkedUser.email})` : "Not linked"}</div>
                    <div>Metaobject: {artist.shopifyMetaobjectId || "—"}</div>
                    <div>Legacy ref: {artist.legacyArtistId || "—"}</div>
                    <div>Updated: {formatDate(artist.updatedAt)}</div>
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-4 xl:min-w-[460px]">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Products</div>
                    <div className="mt-1 font-medium text-slate-900">{artist.productCount}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Pending review</div>
                    <div className="mt-1 font-medium text-slate-900">{artist.pendingReviewCount}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Published</div>
                    <div className="mt-1 font-medium text-slate-900">{artist.publishedCount}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Prints enabled</div>
                    <div className="mt-1 font-medium text-slate-900">{artist.printsEnabledCount}</div>
                  </div>
                  <div className="sm:col-span-4">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Sync</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {artist.syncStatus.needsPush ? "Needs push" : "In sync"} · pull {formatDate(artist.syncStatus.lastPullAt)} · push {formatDate(artist.syncStatus.lastPushAt)}
                    </div>
                    {artist.syncStatus.lastError ? <div className="mt-1 text-xs text-red-600">{artist.syncStatus.lastError}</div> : null}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="matching-queue" className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Matching queue</h2>
          <p className="text-sm text-slate-600">Imported artists and products stay here until an admin confirms the final match.</p>
        </div>
        <MigrationMatchingClient />
      </section>
    </section>
  );
}
