"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ArtistWorkspaceMessagesPanel from "../../artists/[id]/ArtistWorkspaceMessagesPanel";

type Detail = {
  artist: {
    artistKey: string;
    displayName: string;
    handle: string;
    publicSlug: string;
    appUrl: string;
    email: string;
    bio: string;
    locationCity: string;
    locationCountry: string;
    websiteUrl: string;
    instagram: string;
    publicVisible: boolean;
    migrationStatus: string;
    linkStatus: string;
    shopifyMetaobjectId: string;
    legacyArtistId: string;
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
      dirtyFields: string[];
    };
  };
  products: Array<{
    productKey: string;
    title: string;
    handle: string;
    status: string;
    approvalStatus: string;
    derivedStatus: "draft" | "pending_review" | "approved" | "published" | "archived";
    forSale: boolean;
    printsEnabled: boolean;
    originalAvailable: boolean;
    shopifyProductId: string;
    legacyProductId: string;
    migrationStatus: string;
    needsPush: boolean;
    lastPushAt: string | null;
    lastPullAt: string | null;
    lastError: string;
    variantCount: number;
    publishedVariantCount: number;
    updatedAt: string | null;
  }>;
  requests: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string | null;
    reviewerNote: string;
  }>;
  contracts: Array<{
    id: string;
    contractType: string;
    filename: string;
    signedAt: string | null;
    createdAt: string | null;
    s3Url: string;
  }>;
  payout: {
    details: {
      accountHolder: string;
      iban: string;
      bankName: string;
      taxId: string;
    } | null;
    transactions: Array<{
      id: string;
      amount: number;
      currency: string;
      method: string;
      createdAt: string | null;
      note: string;
    }>;
  };
  applications: Array<{
    id: string;
    status: string;
    submittedAt: string | null;
    email: string;
    fullName: string;
    shopifyMetaobjectId: string;
  }>;
  legacy: {
    artist: null | {
      id: string;
      name: string;
      email: string;
      stage: string;
      shopifyMetaobjectId: string;
      handle: string;
      updatedAt: string | null;
    };
  };
  bridge: {
    legacyArtistId: string;
    oldAdminHref: string | null;
    requestsHref: string | null;
    applicationsHref: string;
    messagesAvailable: boolean;
  };
};

type Props = {
  initialDetail: Detail;
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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
}

function badgeTone(status: string) {
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
    case "archived":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function ArtistV2DetailClient({ initialDetail }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [savingProductKey, setSavingProductKey] = useState<string | null>(null);
  const [pushingArtist, setPushingArtist] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const overviewStats = useMemo(
    () => ({
      totalProducts: detail.products.length,
      pendingReview: detail.products.filter((product) => product.derivedStatus === "pending_review").length,
      published: detail.products.filter((product) => product.derivedStatus === "published").length,
      printsEnabled: detail.products.filter((product) => product.printsEnabled).length,
    }),
    [detail.products],
  );

  async function patchProduct(productKey: string, updates: Record<string, unknown>) {
    setSavingProductKey(productKey);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/canonical/products/${encodeURIComponent(productKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to update product");
      setDetail((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.productKey === productKey
            ? {
                ...product,
                ...updates,
                forSale: typeof updates.forSale === "boolean" ? updates.forSale : product.forSale,
                printsEnabled: typeof updates.allowPrints === "boolean" ? updates.allowPrints : product.printsEnabled,
                originalAvailable:
                  typeof updates.originalAvailable === "boolean" ? updates.originalAvailable : product.originalAvailable,
                approvalStatus:
                  typeof updates.approvalStatus === "string" ? updates.approvalStatus : product.approvalStatus,
                derivedStatus:
                  updates.approvalStatus === "published"
                    ? "published"
                    : updates.approvalStatus === "approved"
                      ? "approved"
                      : updates.approvalStatus === "needs_review"
                        ? "pending_review"
                        : updates.approvalStatus === "archived"
                          ? "archived"
                          : product.derivedStatus,
                needsPush: true,
              }
            : product,
        ),
      }));
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update product");
    } finally {
      setSavingProductKey(null);
    }
  }

  async function pushArtist(dryRun = false) {
    setPushingArtist(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/sync/shopify/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "artists",
          artistKeys: [detail.artist.artistKey],
          limit: 1,
          dryRun,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; items?: Array<{ status: string; message: string }> }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to push artist");
      const item = payload?.items?.[0];
      setActionMessage(item?.message || (dryRun ? "Artist dry run completed" : "Artist pushed to Shopify"));
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to push artist");
    } finally {
      setPushingArtist(false);
    }
  }

  async function pushProduct(productKey: string, dryRun = false) {
    setSavingProductKey(productKey);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/sync/shopify/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "products",
          productKeys: [productKey],
          limit: 1,
          dryRun,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; items?: Array<{ key: string; status: string; message: string }> }
        | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to push product");
      const item = payload?.items?.find((entry) => entry.key === productKey) || payload?.items?.[0];
      setActionMessage(item?.message || (dryRun ? "Product dry run completed" : "Product pushed to Shopify"));
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to push product");
    } finally {
      setSavingProductKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/artists-v2" className="text-sm text-slate-500 hover:text-slate-900">
                Back to Artistzentrale
              </Link>
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(detail.artist.linkStatus)}`}>{detail.artist.linkStatus}</span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(detail.artist.migrationStatus)}`}>{detail.artist.migrationStatus}</span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{detail.artist.displayName || detail.artist.artistKey}</h2>
              <div className="mt-1 text-sm text-slate-500">
                {[detail.artist.email, detail.artist.publicSlug ? `/${detail.artist.publicSlug}` : "", detail.artist.artistKey]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
              <div>Linked user: {detail.artist.linkedUser ? `${detail.artist.linkedUser.name || detail.artist.linkedUser.email} (${detail.artist.linkedUser.email})` : "Not linked"}</div>
              <div>Public profile: {detail.artist.publicVisible ? "Visible" : "Hidden"}</div>
              <div>Shopify metaobject: {detail.artist.shopifyMetaobjectId || "—"}</div>
              <div>app_url: {detail.artist.appUrl || "—"}</div>
              <div>Legacy artist ref: {detail.artist.legacyArtistId || "—"}</div>
              <div>Location: {[detail.artist.locationCity, detail.artist.locationCountry].filter(Boolean).join(", ") || "—"}</div>
              <div>Instagram: {detail.artist.instagram || "—"}</div>
            </div>
          </div>

          <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:min-w-[360px]">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Sync</div>
              <div className="mt-1 font-medium text-slate-900">{detail.artist.syncStatus.needsPush ? "Needs push" : "In sync"}</div>
              <div className="mt-2 text-xs text-slate-500">pull {formatDate(detail.artist.syncStatus.lastPullAt)}</div>
              <div className="text-xs text-slate-500">push {formatDate(detail.artist.syncStatus.lastPushAt)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                  disabled={pushingArtist}
                  onClick={() => pushArtist(false)}
                >
                  Push artist to Shopify
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
                  disabled={pushingArtist}
                  onClick={() => pushArtist(true)}
                >
                  Dry run
                </button>
              </div>
              {detail.artist.syncStatus.lastError ? <div className="mt-2 text-xs text-red-600">{detail.artist.syncStatus.lastError}</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Review pressure</div>
              <div className="mt-1 font-medium text-slate-900">{overviewStats.pendingReview} products pending</div>
              <div className="mt-2 text-xs text-slate-500">{overviewStats.published} published · {overviewStats.printsEnabled} with prints</div>
              {detail.artist.syncStatus.dirtyFields.length ? (
                <div className="mt-2 text-xs text-slate-500">Dirty fields: {detail.artist.syncStatus.dirtyFields.join(", ")}</div>
              ) : null}
            </div>
          </div>
        </div>

        {detail.artist.bio ? <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">{detail.artist.bio}</p> : null}
      </div>

      {actionError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div> : null}
      {actionMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionMessage}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold">Canonical products</h3>
              <p className="text-sm text-slate-600">Review artwork status, sale flags and sync readiness directly on canonical products.</p>
            </div>
            <div className="divide-y divide-slate-200">
              {detail.products.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No canonical products assigned yet.</div> : null}
              {detail.products.map((product) => (
                <div key={product.productKey} className="space-y-4 px-5 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-slate-900">{product.title}</div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(product.derivedStatus)}`}>{product.derivedStatus}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">{product.status}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {[product.handle, product.productKey, product.shopifyProductId].filter(Boolean).join(" · ") || "No identifiers yet"}
                      </div>
                      <div className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                        <div>Migration: {product.migrationStatus || "—"}</div>
                        <div>Legacy ref: {product.legacyProductId || "—"}</div>
                        <div>Variants: {product.variantCount} total / {product.publishedVariantCount} published</div>
                        <div>Updated: {formatDate(product.updatedAt)}</div>
                        <div>Last push: {formatDate(product.lastPushAt)}</div>
                        <div>Last pull: {formatDate(product.lastPullAt)}</div>
                      </div>
                    </div>

                    <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={product.forSale}
                          disabled={savingProductKey === product.productKey}
                          onChange={(event) => patchProduct(product.productKey, { forSale: event.target.checked })}
                        />
                        <span>For sale</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={product.printsEnabled}
                          disabled={savingProductKey === product.productKey}
                          onChange={(event) => patchProduct(product.productKey, { allowPrints: event.target.checked })}
                        />
                        <span>Prints enabled</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={product.originalAvailable}
                          disabled={savingProductKey === product.productKey}
                          onChange={(event) => patchProduct(product.productKey, { originalAvailable: event.target.checked })}
                        />
                        <span>Original available</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                      disabled={savingProductKey === product.productKey}
                      onClick={() => pushProduct(product.productKey, false)}
                    >
                      Push product to Shopify
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
                      disabled={savingProductKey === product.productKey}
                      onClick={() => pushProduct(product.productKey, true)}
                    >
                      Dry run
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
                      disabled={savingProductKey === product.productKey}
                      onClick={() => patchProduct(product.productKey, { approvalStatus: "needs_review" })}
                    >
                      Mark needs review
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
                      disabled={savingProductKey === product.productKey}
                      onClick={() => patchProduct(product.productKey, { approvalStatus: "approved" })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
                      disabled={savingProductKey === product.productKey}
                      onClick={() => patchProduct(product.productKey, { approvalStatus: "published", status: "active" })}
                    >
                      Mark published
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
                      disabled={savingProductKey === product.productKey}
                      onClick={() => patchProduct(product.productKey, { approvalStatus: "archived", status: "archived" })}
                    >
                      Archive
                    </button>
                  </div>

                  {product.needsPush || product.lastError ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      <div>{product.needsPush ? "Product changes still need a Shopify push." : "No pending push."}</div>
                      {product.lastError ? <div className="mt-1 text-red-600">{product.lastError}</div> : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {detail.bridge.messagesAvailable ? (
            <ArtistWorkspaceMessagesPanel artistId={detail.bridge.legacyArtistId} />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold">Messages</h3>
              <p className="mt-2 text-sm text-slate-600">No legacy artist bridge is linked yet, so the shared admin message panel is not available on this record.</p>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Shortcuts</h3>
            <div className="mt-4 grid gap-2">
              {detail.bridge.oldAdminHref ? (
                <Link href={detail.bridge.oldAdminHref} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  Open legacy artist detail
                </Link>
              ) : null}
              {detail.bridge.requestsHref ? (
                <a href={detail.bridge.requestsHref} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  Open request review
                </a>
              ) : null}
              <a href={detail.bridge.applicationsHref} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                Open applications
              </a>
              {detail.artist.publicSlug ? (
                <a href={`/artist/${detail.artist.publicSlug}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  View public profile
                </a>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Requests</h3>
            <div className="mt-4 space-y-3">
              {detail.requests.length === 0 ? <div className="text-sm text-slate-500">No legacy requests linked yet.</div> : null}
              {detail.requests.map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">{request.type}</div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(request.status)}`}>{request.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatDate(request.createdAt)}</div>
                  {request.reviewerNote ? <div className="mt-2 text-xs text-slate-600">{request.reviewerNote}</div> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Contracts & payouts</h3>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Contracts</div>
                <div className="mt-2 space-y-2">
                  {detail.contracts.length === 0 ? <div className="text-sm text-slate-500">No contracts linked yet.</div> : null}
                  {detail.contracts.map((contract) => (
                    <div key={contract.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="text-sm font-medium text-slate-900">{contract.filename || contract.contractType}</div>
                      <div className="mt-1 text-xs text-slate-500">Signed {formatDate(contract.signedAt)} · uploaded {formatDate(contract.createdAt)}</div>
                      {contract.s3Url ? (
                        <a href={contract.s3Url} className="mt-2 inline-block text-xs text-slate-700 underline">
                          Open file
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Payout details</div>
                {detail.payout.details ? (
                  <div className="mt-2 text-sm text-slate-600">
                    <div>{detail.payout.details.accountHolder || "Unnamed holder"}</div>
                    <div>{detail.payout.details.bankName || "Unknown bank"}</div>
                    <div>{detail.payout.details.iban || "No IBAN saved"}</div>
                    <div>{detail.payout.details.taxId || "No tax id saved"}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">No payout details linked yet.</div>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Transactions</div>
                <div className="mt-2 space-y-2">
                  {detail.payout.transactions.length === 0 ? <div className="text-sm text-slate-500">No payout transactions found.</div> : null}
                  {detail.payout.transactions.map((transaction) => (
                    <div key={transaction.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="text-sm font-medium text-slate-900">{formatCurrency(transaction.amount, transaction.currency)}</div>
                      <div className="mt-1 text-xs text-slate-500">{transaction.method} · {formatDate(transaction.createdAt)}</div>
                      {transaction.note ? <div className="mt-2 text-xs text-slate-600">{transaction.note}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold">Legacy data inspector</h3>
            <div className="mt-4 space-y-4">
              {detail.legacy.artist ? (
                <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">{detail.legacy.artist.name}</div>
                  <div className="mt-1">{[detail.legacy.artist.email, detail.legacy.artist.stage].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {[
                      detail.legacy.artist.shopifyMetaobjectId ? `metaobject ${detail.legacy.artist.shopifyMetaobjectId}` : "",
                      detail.legacy.artist.handle ? `handle ${detail.legacy.artist.handle}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No legacy sync ids"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Updated {formatDate(detail.legacy.artist.updatedAt)}</div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">No linked legacy artist record yet.</div>
              )}

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Applications</div>
                <div className="mt-2 space-y-2">
                  {detail.applications.length === 0 ? <div className="text-sm text-slate-500">No matching legacy applications found.</div> : null}
                  {detail.applications.map((application) => (
                    <div key={application.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{application.fullName || application.email || application.id}</div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(application.status)}`}>{application.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{[application.email, formatDate(application.submittedAt)].filter(Boolean).join(" · ")}</div>
                      {application.shopifyMetaobjectId ? <div className="mt-1 text-xs text-slate-500">Metaobject {application.shopifyMetaobjectId}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
