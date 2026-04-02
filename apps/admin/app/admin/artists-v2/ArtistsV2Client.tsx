"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

type SyncQueueRow = {
  kind: "artist" | "product";
  key: string;
  title: string;
  artistKey: string;
  artistLabel: string;
  destination: string;
  operation: "create" | "update";
  status: "open" | "completed" | "error";
  shopifyId: string;
  approvalStatus: string;
  needsPush: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
};

type Props = {
  initialArtists: ArtistRow[];
  meta: Meta;
  initialSyncQueue: SyncQueueRow[];
};

type ActionState = {
  loading: boolean;
  error: string | null;
  message: string | null;
};

type StepKey = "accounts" | "artworks" | "shopify";
type Bucket = "open" | "completed" | "error";

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

function badgeTone(status: string) {
  switch (status) {
    case "completed":
    case "linked":
    case "assigned":
    case "open":
      return "bg-emerald-50 text-emerald-700";
    case "in_progress":
    case "needs_review":
      return "bg-amber-50 text-amber-700";
    case "error":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function queueCounts(meta: Meta, syncQueue: SyncQueueRow[]) {
  return {
    accounts: {
      open: meta.review.artistMatches + meta.review.unlinkedAccounts,
      completed: 0,
      error: 0,
    },
    artworks: {
      open: meta.review.productAssignments,
      completed: 0,
      error: 0,
    },
    shopify: {
      open: syncQueue.filter((item) => item.status === "open").length,
      completed: syncQueue.filter((item) => item.status === "completed").length,
      error: syncQueue.filter((item) => item.status === "error").length,
    },
  };
}

function stepStatus(openCount: number, hasStarted: boolean) {
  if (openCount > 0) return "in_progress";
  if (hasStarted) return "completed";
  return "not_started";
}

function nextOpenStep(meta: Meta, syncQueue: SyncQueueRow[]): StepKey {
  if (meta.review.artistMatches + meta.review.unlinkedAccounts > 0) return "accounts";
  if (meta.review.productAssignments > 0) return "artworks";
  if (syncQueue.some((item) => item.status === "open")) return "shopify";
  return "shopify";
}

function stepCopy(step: StepKey) {
  switch (step) {
    case "accounts":
      return {
        title: "Accounts verbinden",
        description: "Bestehende Künstlerdatensätze mit einem App-User verknüpfen oder einen neuen User anlegen.",
      };
    case "artworks":
      return {
        title: "Kunstwerke zuordnen",
        description: "Importierte Werke dem richtigen Künstler zuweisen. Danach erscheinen sie in seiner Artist App.",
      };
    default:
      return {
        title: "Shopify synchronisieren",
        description: "Nur freigegebene Datensätze per Dry Run prüfen und danach kontrolliert nach Shopify schreiben.",
      };
  }
}

function isStepUnlocked(step: StepKey, meta: Meta) {
  if (step === "accounts") return true;
  if (step === "artworks") return meta.review.artistMatches + meta.review.unlinkedAccounts === 0;
  return meta.review.artistMatches + meta.review.unlinkedAccounts === 0 && meta.review.productAssignments === 0;
}

function ShopifyQueuePanel({
  items,
  bucket,
  nextSignal,
  onResult,
  writeEnabled,
}: {
  items: SyncQueueRow[];
  bucket: Bucket;
  nextSignal: number;
  onResult?: (message: string) => void;
  writeEnabled: boolean;
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<ActionState>({ loading: false, error: null, message: null });
  const previousNextSignal = useRef(nextSignal);

  const queue = useMemo(() => items.filter((item) => item.status === bucket), [items, bucket]);
  const currentItem = queue[currentIndex] || null;

  useEffect(() => {
    setCurrentIndex((current) => (queue.length === 0 ? 0 : Math.min(current, queue.length - 1)));
  }, [queue.length, bucket]);

  useEffect(() => {
    if (previousNextSignal.current === nextSignal) return;
    previousNextSignal.current = nextSignal;
    if (!queue.length) return;
    setCurrentIndex((current) => (current + 1) % queue.length);
  }, [nextSignal, queue.length]);

  async function run(item: SyncQueueRow, dryRun: boolean) {
    const consequence = dryRun
      ? `${item.title} wird geprüft. Es wird nichts nach Shopify geschrieben.`
      : `Dieser Datensatz wird jetzt nach Shopify geschrieben.`;
    if (!window.confirm(`${consequence}\n\nBestätigen?`)) return;

    setState({ loading: true, error: null, message: null });
    try {
      const body =
        item.kind === "artist"
          ? { scope: "artists", artistKeys: [item.artistKey], limit: 1, dryRun }
          : { scope: "products", productKeys: [item.key], limit: 1, dryRun };
      const res = await fetch("/api/admin/sync/shopify/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; items?: Array<{ key?: string; status?: string; message?: string }> }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Shopify action failed");
      const itemResult = payload?.items?.find((entry) => entry.key === item.key) || payload?.items?.[0];
      const message = itemResult?.message || (dryRun ? "Dry run abgeschlossen." : "Shopify Sync abgeschlossen.");
      setState({ loading: false, error: null, message });
      onResult?.(message);
      router.refresh();
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : "Shopify action failed",
        message: null,
      });
    }
  }

  return (
    <section className="space-y-4">
      {state.error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div> : null}
      {state.message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.message}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Shopify Queue</div>
            <h3 className="text-lg font-semibold text-slate-900">
              {queue.length ? `Fall ${currentIndex + 1} von ${queue.length}` : "Keine Fälle in dieser Ansicht"}
            </h3>
            <p className="text-sm text-slate-600">Nur ein Shopify-Fall gleichzeitig. Erst prüfen, dann gezielt senden.</p>
          </div>
          {queue.length > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentIndex((current) => (current - 1 + queue.length) % queue.length)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((current) => (current + 1) % queue.length)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                Weiter
              </button>
            </div>
          ) : null}
        </div>

        {!currentItem ? (
          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">In dieser Ansicht gibt es aktuell keine Shopify-Fälle.</div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xl font-semibold text-slate-900">{currentItem.title}</h4>
                <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(currentItem.status)}`}>{currentItem.status}</span>
              </div>
              <div className="text-sm text-slate-500">
                {currentItem.artistLabel} · {currentItem.destination}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Was passiert hier?</div>
              <div className="mt-2 text-sm text-slate-700">
                {currentItem.operation === "create" ? "Shopify erstellt einen neuen Datensatz." : "Ein bestehender Shopify-Datensatz wird aktualisiert."}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Ziel: {currentItem.destination}
                {currentItem.shopifyId ? ` · bestehende Shopify-ID ${currentItem.shopifyId}` : " · noch keine Shopify-ID vorhanden"}
              </div>
              {currentItem.kind === "product" ? (
                <div className="mt-1 text-xs text-slate-500">Approval Status: {currentItem.approvalStatus || "—"}</div>
              ) : null}
              {currentItem.lastError ? <div className="mt-2 text-sm text-rose-700">{currentItem.lastError}</div> : null}
            </div>

            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
              <div>Last pull: {formatDate(currentItem.lastPullAt)}</div>
              <div>Last push: {formatDate(currentItem.lastPushAt)}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void run(currentItem, true)}
                disabled={state.loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                {state.loading ? "Läuft…" : "Dry run"}
              </button>
              <button
                type="button"
                onClick={() => void run(currentItem, false)}
                disabled={state.loading || !writeEnabled}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {state.loading ? "Läuft…" : "Jetzt zu Shopify senden"}
              </button>
            </div>

            <div className="text-xs text-slate-500">
              {writeEnabled
                ? "Dry run zeigt die Änderung ohne Write. Der Push schreibt genau diesen Datensatz nach Shopify."
                : "Shopify Write ist aktuell deaktiviert. Dry run bleibt möglich, echter Push nicht."}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ArtistsV2Client({ meta, initialSyncQueue }: Props) {
  const router = useRouter();
  const [bucket, setBucket] = useState<Bucket>("open");
  const [activeStep, setActiveStep] = useState<StepKey>(() => nextOpenStep(meta, initialSyncQueue));
  const [actionState, setActionState] = useState<ActionState>({ loading: false, error: null, message: null });
  const [nextSignal, setNextSignal] = useState(0);

  const counts = useMemo(() => queueCounts(meta, initialSyncQueue), [meta, initialSyncQueue]);

  useEffect(() => {
    if (bucket !== "open") return;
    setActiveStep((current) => (isStepUnlocked(current, meta) ? current : nextOpenStep(meta, initialSyncQueue)));
  }, [bucket, meta, initialSyncQueue]);

  const processSteps = [
    {
      key: "accounts" as const,
      number: 1,
      title: "Accounts verbinden",
      description: "User-Accounts mit Künstlern verbinden oder neue Accounts anlegen.",
      status: stepStatus(counts.accounts.open, Boolean(meta.activity.lastImportAt)),
      count: counts.accounts.open,
    },
    {
      key: "artworks" as const,
      number: 2,
      title: "Kunstwerke zuordnen",
      description: "Importierte Werke dem richtigen Künstler zuweisen.",
      status: stepStatus(counts.artworks.open, Boolean(meta.activity.lastImportAt)),
      count: counts.artworks.open,
    },
    {
      key: "shopify" as const,
      number: 3,
      title: "Shopify synchronisieren",
      description: "Nur freigegebene Datensätze per Dry run prüfen und danach schreiben.",
      status: stepStatus(counts.shopify.open, Boolean(meta.activity.lastSyncAt)),
      count: counts.shopify.open,
    },
  ];

  async function runAction(
    label: string,
    input: { url: string; body?: Record<string, unknown>; confirmText: string; successText: (payload: any) => string },
  ) {
    if (!window.confirm(input.confirmText)) return;

    setActionState({ loading: true, error: null, message: null });
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body || {}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || `${label} failed`);
      setActionState({ loading: false, error: null, message: input.successText(payload) });
      router.refresh();
    } catch (error) {
      setActionState({
        loading: false,
        error: error instanceof Error ? error.message : `${label} failed`,
        message: null,
      });
    }
  }

  const activeCopy = stepCopy(activeStep);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Migration status</div>
            <h2 className="text-xl font-semibold text-slate-900">Einfacher Migrations-Workflow</h2>
            <p className="text-sm text-slate-600">
              Arbeite immer nur am nächsten offenen Fall. Read-only-Import bleibt sicher, Shopify-Write bleibt kontrolliert.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div>Migration mode: <span className="font-medium text-slate-900">{meta.flags.migrationMode ? "aktiv" : "inaktiv"}</span></div>
            <div>Shopify write: <span className="font-medium text-slate-900">{meta.flags.shopifyWriteEnabled ? "aktiv" : "deaktiviert"}</span></div>
            <div>Last import: <span className="font-medium text-slate-900">{formatDate(meta.activity.lastImportAt)}</span></div>
            <div>Last sync: <span className="font-medium text-slate-900">{formatDate(meta.activity.lastSyncAt)}</span></div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-900 disabled:opacity-50"
            disabled={actionState.loading}
            onClick={() =>
              runAction("Shopify import", {
                url: "/api/admin/sync/shopify/import",
                body: { scope: "all", limit: 100 },
                confirmText: "Es werden Künstler und Produkte read-only aus Shopify in die kanonische DB eingelesen. Shopify wird nicht verändert.\n\nBestätigen?",
                successText: (payload) =>
                  `Shopify-Import abgeschlossen. ${Array.isArray(payload?.results) ? payload.results.map((result: { scope: string; importedCount?: number }) => `${result.scope}: ${result.importedCount ?? 0}`).join(" · ") : "Import fertig."}`,
              })
            }
          >
            Import from Shopify
            <div className="mt-1 text-xs font-normal text-slate-500">Read-only import from Shopify into canonical DB.</div>
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-900 disabled:opacity-50"
            disabled={actionState.loading}
            onClick={() =>
              runAction("Legacy import", {
                url: "/api/admin/sync/legacy/import",
                body: { scope: "all", limit: 250 },
                confirmText: "Alte interne Artist- und Produktdaten werden in das neue kanonische System gespiegelt oder referenziert. Shopify bleibt unverändert.\n\nBestätigen?",
                successText: (payload) =>
                  `Legacy-Import abgeschlossen. Artists: ${payload?.artists?.upsertedCount ?? 0} · Products: ${payload?.products?.upsertedCount ?? 0} · Konflikte: ${(payload?.artists?.conflictCount || 0) + (payload?.products?.conflictCount || 0)}`,
              })
            }
          >
            Import from Legacy
            <div className="mt-1 text-xs font-normal text-slate-500">Spiegelt alte interne Daten ins kanonische System.</div>
          </button>
          <button
            type="button"
            onClick={() => setNextSignal((current) => current + 1)}
            className="rounded-lg bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            disabled={
              (activeStep === "accounts" && counts.accounts[bucket] === 0) ||
              (activeStep === "artworks" && counts.artworks[bucket] === 0) ||
              (activeStep === "shopify" && counts.shopify[bucket] === 0)
            }
          >
            Nächsten offenen Fall öffnen
          </button>
        </div>

        <div className="mt-3">
          <Link href="/admin/artists-v2/artworks" className="text-sm font-medium text-slate-700 hover:text-slate-900">
            Separate Artwork-Matching-Ansicht öffnen
          </Link>
        </div>
      </div>

      {actionState.error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionState.error}</div> : null}
      {actionState.message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionState.message}</div> : null}

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">3 Schritte</h2>
          <p className="text-sm text-slate-600">Nur der nächste sinnvolle Schritt ist aktiv. Spätere Schritte bleiben gesperrt, bis der vorherige sauber erledigt ist.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {processSteps.map((step) => {
            const active = activeStep === step.key;
            const unlocked = bucket !== "open" || isStepUnlocked(step.key, meta);
            return (
              <button
                key={step.key}
                type="button"
                disabled={!unlocked}
                onClick={() => setActiveStep(step.key)}
                className={`rounded-2xl border p-4 text-left disabled:opacity-50 ${active ? "border-black bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Schritt {step.number}</div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(step.status)}`}>{step.status.replace("_", " ")}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{step.title}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">{step.description}</div>
                {step.count > 0 ? <div className="mt-3 text-xs text-slate-500">{step.count} offen</div> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Aktiver Schritt</div>
          <h2 className="text-lg font-semibold text-slate-900">{activeCopy.title}</h2>
          <p className="text-sm text-slate-600">{activeCopy.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["open", "completed", "error"] as Bucket[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBucket(value)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${bucket === value ? "bg-black text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {value === "open" ? "Offen" : value === "completed" ? "Erledigt" : "Fehler"}
            </button>
          ))}
        </div>

        {bucket === "open" ? (
          <div className="flex flex-wrap gap-2">
            {(["accounts", "artworks", "shopify"] as StepKey[]).map((step) => {
              const unlocked = isStepUnlocked(step, meta);
              return (
                <button
                  key={step}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => setActiveStep(step)}
                  className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${activeStep === step ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  {step === "accounts" ? "Accounts" : step === "artworks" ? "Artworks" : "Shopify"}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {activeStep === "accounts" ? (
        <MigrationMatchingClient
          mode="accounts"
          bucket={bucket}
          nextSignal={nextSignal}
          onResult={(message) => {
            setActionState({ loading: false, error: null, message });
            router.refresh();
          }}
        />
      ) : null}

      {activeStep === "artworks" ? (
        <MigrationMatchingClient
          mode="artworks"
          bucket={bucket}
          nextSignal={nextSignal}
          onResult={(message) => {
            setActionState({ loading: false, error: null, message });
            router.refresh();
          }}
        />
      ) : null}

      {activeStep === "shopify" ? (
        <ShopifyQueuePanel
          items={initialSyncQueue}
          bucket={bucket}
          nextSignal={nextSignal}
          writeEnabled={meta.flags.shopifyWriteEnabled}
          onResult={(message) => {
            setActionState({ loading: false, error: null, message });
          }}
        />
      ) : null}
    </section>
  );
}
