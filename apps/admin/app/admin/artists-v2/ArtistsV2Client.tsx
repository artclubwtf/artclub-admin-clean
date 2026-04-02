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

type Meta = {
  flags: {
    migrationMode: boolean;
    shopifyWriteEnabled: boolean;
  };
  activity: {
    lastImportAt: string | null;
    lastSyncAt: string | null;
  };
  review: {
    openItems: number;
    artistMatches: number;
    productAssignments: number;
    unlinkedAccounts: number;
    syncReady: number;
  };
};

type Props = {
  initialArtists: ArtistRow[];
  meta: Meta;
};

type ActionState = {
  loading: boolean;
  error: string | null;
  message: string | null;
};

type StepStatus = "not_started" | "in_progress" | "needs_review" | "completed";

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
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "needs_review":
    case "pending_review":
    case "suggested":
    case "in_progress":
      return "bg-amber-50 text-amber-700";
    case "imported_unlinked":
    case "imported_unmapped":
    case "unlinked":
    case "unassigned":
    case "not_started":
      return "bg-slate-100 text-slate-700";
    case "archived":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function processCopy() {
  return [
    {
      id: "import",
      step: 1,
      title: "Import data",
      description: "Reads artists and products from Shopify and legacy data into the DB. Does not write anything to Shopify.",
    },
    {
      id: "match",
      step: 2,
      title: "Match artists",
      description: "Links imported artist records to canonical artists. Can be changed later by admin.",
    },
    {
      id: "assign",
      step: 3,
      title: "Assign products",
      description: "Assigns imported products to the correct artist. Does not sync to Shopify yet.",
    },
    {
      id: "link",
      step: 4,
      title: "Link accounts",
      description: "Connects app user accounts to canonical artists. Controls who can access the new artist app.",
    },
    {
      id: "dryrun",
      step: 5,
      title: "Dry run",
      description: "Shows what would be created or updated in Shopify. No real writes.",
    },
    {
      id: "push",
      step: 6,
      title: "Push to Shopify",
      description: "Creates or updates Metaobjects and Products in Shopify. Only for approved and syncable records.",
    },
  ] as const;
}

function deriveStepState(meta: Meta) {
  const importStatus: StepStatus = meta.activity.lastImportAt ? "completed" : "not_started";
  const matchStatus: StepStatus =
    meta.review.artistMatches > 0 ? "needs_review" : meta.activity.lastImportAt ? "completed" : "not_started";
  const assignStatus: StepStatus =
    meta.review.productAssignments > 0 ? "needs_review" : meta.activity.lastImportAt ? "completed" : "not_started";
  const linkStatus: StepStatus =
    meta.review.unlinkedAccounts > 0 ? "needs_review" : meta.activity.lastImportAt ? "completed" : "not_started";
  const dryRunStatus: StepStatus =
    !meta.flags.shopifyWriteEnabled ? "not_started" : meta.review.syncReady > 0 ? "in_progress" : "completed";
  const pushStatus: StepStatus =
    !meta.flags.shopifyWriteEnabled ? "not_started" : meta.review.syncReady > 0 ? "in_progress" : meta.activity.lastSyncAt ? "completed" : "not_started";

  const steps = [
    { id: "import", status: importStatus, count: meta.activity.lastImportAt ? 1 : 0 },
    { id: "match", status: matchStatus, count: meta.review.artistMatches },
    { id: "assign", status: assignStatus, count: meta.review.productAssignments },
    { id: "link", status: linkStatus, count: meta.review.unlinkedAccounts },
    { id: "dryrun", status: dryRunStatus, count: meta.review.syncReady },
    { id: "push", status: pushStatus, count: meta.review.syncReady },
  ];

  const activeStep =
    steps.find((step) => step.status === "needs_review")?.id ||
    steps.find((step) => step.status === "in_progress")?.id ||
    steps.find((step) => step.status === "not_started")?.id ||
    "push";

  return { steps, activeStep };
}

export default function ArtistsV2Client({ initialArtists, meta }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedArtistKeys, setSelectedArtistKeys] = useState<string[]>([]);
  const [actionState, setActionState] = useState<ActionState>({ loading: false, error: null, message: null });

  const processSteps = useMemo(() => processCopy(), []);
  const processState = useMemo(() => deriveStepState(meta), [meta]);

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

      if (sourceFilter === "legacy" && !artist.legacyArtistId) return false;
      if (sourceFilter === "shopify" && !artist.shopifyMetaobjectId) return false;

      switch (statusFilter) {
        case "linked":
          return artist.linkStatus === "linked";
        case "imported":
          return artist.migrationStatus === "imported_unlinked";
        case "needs_review":
          return artist.reviewStatus === "needs_review" || artist.linkStatus === "needs_review";
        case "sync_needed":
          return artist.syncStatus.needsPush;
        default:
          return true;
      }
    });
  }, [initialArtists, query, statusFilter, sourceFilter]);

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

  async function runAction(
    label: string,
    input: { url: string; body?: Record<string, unknown>; confirmText?: string },
  ) {
    if (input.confirmText && !window.confirm(input.confirmText)) return;

    setActionState({ loading: true, error: null, message: null });
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body || {}),
      });
      const payload = (await res.json().catch(() => null)) as
        | {
            error?: string;
            results?: Array<{ scope: string; importedCount?: number }>;
            importedCount?: number;
            artists?: { upsertedCount?: number; conflictCount?: number };
            products?: { upsertedCount?: number; conflictCount?: number };
            referenced?: Record<string, number>;
            pushedCount?: number;
            failedCount?: number;
            skippedCount?: number;
          }
        | null;
      if (!res.ok) throw new Error(payload?.error || `${label} failed`);

      const summaryText =
        label === "Legacy import"
          ? [
              payload?.artists ? `artists: ${payload.artists.upsertedCount ?? 0}` : "",
              payload?.products ? `products: ${payload.products.upsertedCount ?? 0}` : "",
              payload?.referenced ? `referenced: ${Object.values(payload.referenced).reduce((sum, value) => sum + (Number(value) || 0), 0)}` : "",
              (payload?.artists?.conflictCount || payload?.products?.conflictCount)
                ? `conflicts: ${(payload?.artists?.conflictCount || 0) + (payload?.products?.conflictCount || 0)}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : payload?.results?.length
            ? payload.results.map((result) => `${result.scope}: ${result.importedCount ?? 0}`).join(" · ")
            : payload?.pushedCount !== undefined
              ? `success ${payload.pushedCount ?? 0} · skipped ${payload.skippedCount ?? 0} · errors ${payload.failedCount ?? 0}`
              : payload?.importedCount != null
                ? `${payload.importedCount} items`
                : "Done";

      setActionState({ loading: false, error: null, message: `${label} completed. ${summaryText}` });
      if (label.startsWith("Sync selected") || label.startsWith("Dry run selected")) {
        setSelectedArtistKeys([]);
      }
      router.refresh();
    } catch (error) {
      setActionState({
        loading: false,
        error: error instanceof Error ? error.message : `${label} failed`,
        message: null,
      });
    }
  }

  const activeStepCopy = processSteps.find((step) => step.id === processState.activeStep) || processSteps[0];

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Migration status</div>
            <h2 className="text-xl font-semibold">Current system state</h2>
            <p className="text-sm text-slate-600">This banner tells you whether you are still in safe import/review mode or already able to write back to Shopify.</p>
          </div>
          <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:min-w-[520px]">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Migration mode</div>
              <div className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(meta.flags.migrationMode ? "in_progress" : "not_started")}`}>
                {meta.flags.migrationMode ? "active" : "inactive"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Shopify write</div>
              <div className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(meta.flags.shopifyWriteEnabled ? "in_progress" : "not_started")}`}>
                {meta.flags.shopifyWriteEnabled ? "enabled" : "disabled"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Last import</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(meta.activity.lastImportAt)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Last sync</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{formatDate(meta.activity.lastSyncAt)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Open review items</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {meta.review.openItems} total · {meta.review.artistMatches} artist matches · {meta.review.productAssignments} product assignments · {meta.review.unlinkedAccounts} account links
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Migration process</h2>
          <p className="text-sm text-slate-600">Follow the steps in order. The highlighted step is the next meaningful action based on the current data state.</p>
        </div>
        <div className="grid gap-3 xl:grid-cols-6">
          {processSteps.map((step) => {
            const state = processState.steps.find((item) => item.id === step.id);
            const isActive = processState.activeStep === step.id;
            return (
              <div
                key={step.id}
                className={`rounded-2xl border p-4 ${isActive ? "border-black bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Step {step.step}</div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(state?.status || "not_started")}`}>
                    {state?.status?.replace("_", " ") || "not started"}
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{step.title}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">{step.description}</div>
                {state?.count ? <div className="mt-3 text-xs text-slate-500">{state.count} open items</div> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Current focus</div>
            <h2 className="text-lg font-semibold">{activeStepCopy.title}</h2>
            <p className="text-sm text-slate-600">{activeStepCopy.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search artists or products</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, slug, email, vendor, ids"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Filter by status</span>
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
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Filter by source</span>
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                >
                  <option value="all">All</option>
                  <option value="shopify">Shopify-linked</option>
                  <option value="legacy">Legacy-linked</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">Import data</div>
          <div className="mt-2 text-sm text-slate-600">Reads artists and products from Shopify and legacy data into the DB. Does not write anything to Shopify.</div>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              className="w-full rounded-lg bg-black px-4 py-2 text-left text-sm font-medium text-white disabled:opacity-60"
              disabled={actionState.loading}
              onClick={() =>
                runAction("Shopify import", {
                  url: "/api/admin/sync/shopify/import",
                  body: { scope: "all", limit: 100 },
                  confirmText: "Run a read-only Shopify import?\n\nThis reads artists and products into the canonical DB and does not write anything back to Shopify.",
                })
              }
            >
              Import from Shopify
            </button>
            <div className="text-xs text-slate-500">Read-only import from Shopify into canonical DB.</div>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-left text-sm font-medium text-slate-700 disabled:opacity-60"
              disabled={actionState.loading}
              onClick={() =>
                runAction("Legacy import", {
                  url: "/api/admin/sync/legacy/import",
                  body: { scope: "all", limit: 250 },
                  confirmText: "Import legacy internal artist and product data into canonical records?\n\nThis updates canonical records and stores legacy references, but it does not write to Shopify.",
                })
              }
            >
              Import from Legacy
            </button>
            <div className="text-xs text-slate-500">Reads legacy admin data, mirrors it into canonical records and preserves references.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">Dry run</div>
          <div className="mt-2 text-sm text-slate-600">Shows what would be created or updated in Shopify. No real writes happen.</div>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-left text-sm font-medium text-slate-700 disabled:opacity-60"
              disabled={actionState.loading || selectedArtistKeys.length === 0}
              onClick={() =>
                runAction("Dry run selected artists", {
                  url: "/api/admin/sync/shopify/push",
                  body: { scope: "artists", artistKeys: selectedArtistKeys, limit: selectedArtistKeys.length, dryRun: true },
                  confirmText: `Dry run ${selectedArtistKeys.length} selected artists?\n\nThis shows which artist metaobjects would be created or updated in Shopify without writing anything.`,
                })
              }
            >
              Dry run selected artists
            </button>
            <div className="text-xs text-slate-500">Shows Shopify metaobject changes without writing.</div>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-left text-sm font-medium text-slate-700 disabled:opacity-60"
              disabled={actionState.loading}
              onClick={() =>
                runAction("Dry run approved products", {
                  url: "/api/admin/sync/shopify/push",
                  body: { scope: "products", approvedOnly: true, limit: 100, dryRun: true },
                  confirmText: "Dry run all approved products?\n\nThis shows product and variant updates without writing anything to Shopify.",
                })
              }
            >
              Dry run approved products
            </button>
            <div className="text-xs text-slate-500">Shows product and variant changes for approved works only.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">Push to Shopify</div>
          <div className="mt-2 text-sm text-slate-600">Creates or updates Metaobjects and Products in Shopify. Only for approved and syncable records.</div>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              className="w-full rounded-lg bg-black px-4 py-2 text-left text-sm font-medium text-white disabled:opacity-60"
              disabled={actionState.loading || selectedArtistKeys.length === 0 || !meta.flags.shopifyWriteEnabled}
              onClick={() =>
                runAction("Sync selected artists", {
                  url: "/api/admin/sync/shopify/push",
                  body: { scope: "artists", artistKeys: selectedArtistKeys, limit: selectedArtistKeys.length },
                  confirmText: `This will write ${selectedArtistKeys.length} artist metaobject(s) to Shopify.\n\nContinue?`,
                })
              }
            >
              Sync selected artists
            </button>
            <div className="text-xs text-slate-500">Writes selected canonical artists to Shopify as `kunstler` metaobjects.</div>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-left text-sm font-medium text-slate-700 disabled:opacity-60"
              disabled={actionState.loading || !meta.flags.shopifyWriteEnabled}
              onClick={() =>
                runAction("Sync all approved products", {
                  url: "/api/admin/sync/shopify/push",
                  body: { scope: "products", approvedOnly: true, limit: 100 },
                  confirmText: "This will write approved, syncable products and variants to Shopify.\n\nUnapproved saleable works stay skipped. Continue?",
                })
              }
            >
              Sync all approved products
            </button>
            <div className="text-xs text-slate-500">Writes approved products and variants to Shopify. Unapproved saleable works are skipped.</div>
          </div>
        </div>
      </section>

      {actionState.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionState.error}</div> : null}
      {actionState.message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionState.message}</div> : null}

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Review queues</h2>
          <p className="text-sm text-slate-600">These are the records that still need human review before account linking, dry runs or Shopify writes are safe.</p>
        </div>
        <MigrationMatchingClient
          onResult={(message) => setActionState({ loading: false, error: null, message })}
        />
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white" open={processState.activeStep === "push" || processState.activeStep === "dryrun"}>
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">Canonical artist overview</summary>
        <div className="border-t border-slate-200">
          <div className="grid gap-3 px-5 py-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Artists</div>
              <div className="mt-2 text-2xl font-semibold">{summary.total}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Imported</div>
              <div className="mt-2 text-2xl font-semibold">{summary.imported}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Linked</div>
              <div className="mt-2 text-2xl font-semibold">{summary.linked}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Sync needed</div>
              <div className="mt-2 text-2xl font-semibold">{summary.syncNeeded}</div>
            </div>
          </div>
          <div className="divide-y divide-slate-200">
            {filteredArtists.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No artists match the current filters.</div> : null}
            {filteredArtists.map((artist) => (
              <div key={artist.artistKey} className="px-5 py-4 transition hover:bg-slate-50">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="mr-1 inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedArtistKeys.includes(artist.artistKey)}
                          onChange={(event) =>
                            setSelectedArtistKeys((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, artist.artistKey]))
                                : current.filter((key) => key !== artist.artistKey),
                            )
                          }
                        />
                      </label>
                      <Link href={`/admin/artists-v2/${encodeURIComponent(artist.artistKey)}`} className="text-base font-semibold text-slate-900 hover:underline">
                        {artist.displayName}
                      </Link>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(artist.canonicalStatus)}`}>{artist.canonicalStatus}</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(artist.linkStatus)}`}>{artist.linkStatus}</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeTone(artist.reviewStatus)}`}>{artist.reviewStatus}</span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {[artist.email, artist.publicSlug ? `/${artist.publicSlug}` : "", artist.artistKey].filter(Boolean).join(" · ")}
                    </div>
                    <div className="grid gap-1 text-xs text-slate-500 md:grid-cols-2">
                      <div>Linked account: {artist.linkedUser ? `${artist.linkedUser.name || artist.linkedUser.email} (${artist.linkedUser.email})` : "Not linked"}</div>
                      <div>Shopify ref: {artist.shopifyMetaobjectId || "—"}</div>
                      <div>Legacy ref: {artist.legacyArtistId || "—"}</div>
                      <div>Last touched: {formatDate(artist.updatedAt)}</div>
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
                      <div className="text-xs uppercase tracking-wide text-slate-400">Sync state</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {artist.syncStatus.needsPush ? "Needs push" : "In sync"} · pull {formatDate(artist.syncStatus.lastPullAt)} · push {formatDate(artist.syncStatus.lastPushAt)}
                      </div>
                      {artist.syncStatus.lastError ? <div className="mt-1 text-xs text-red-600">{artist.syncStatus.lastError}</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
