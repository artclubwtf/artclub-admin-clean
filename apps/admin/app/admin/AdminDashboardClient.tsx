"use client";

import { useEffect, useState } from "react";

type Metrics = {
  ordersTodayCount: number;
  openPayoutArtistsCount: number;
  missingContractCount: number;
  missingPayoutDetailsCount: number;
};

type OrdersSnapshot = {
  today: { revenue: number; count: number };
  last7: { revenue: number; count: number };
};

type GaSnapshot =
  | {
      configured: true;
      today: { sessions: number; activeUsers: number };
      last7: { sessions: number; activeUsers: number };
    }
  | {
      configured: false;
      required?: string[];
    }
  | null;

type MobileFeedCacheStats = {
  count: number;
  lastImportedAt: string | null;
};

export default function AdminDashboardClient() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordersSnapshot, setOrdersSnapshot] = useState<OrdersSnapshot | null>(null);
  const [gaSnapshot, setGaSnapshot] = useState<GaSnapshot>(null);
  const [cacheStats, setCacheStats] = useState<MobileFeedCacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [cacheHidden, setCacheHidden] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/metrics", { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load metrics");
        }
        const json = await res.json();
        if (!active) return;
        setMetrics(json as Metrics);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load metrics");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadCache = async () => {
      setCacheLoading(true);
      setCacheError(null);
      try {
        const res = await fetch("/api/admin/mobile-feed-cache", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          if (active) setCacheHidden(true);
          return;
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load cache stats");
        }
        const json = await res.json();
        if (!active) return;
        setCacheStats({
          count: Number(json?.count || 0),
          lastImportedAt: typeof json?.lastImportedAt === "string" ? json.lastImportedAt : null,
        });
      } catch (err: any) {
        if (!active) return;
        setCacheError(err?.message ?? "Failed to load cache stats");
      } finally {
        if (active) setCacheLoading(false);
      }
    };

    loadCache();
    return () => {
      active = false;
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/admin/sync/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to sync artworks");
      }
      const importedCount = Number(payload.imported || 0);
      const nextCursorInfo = payload.nextCursor ? ` Next cursor: ${payload.nextCursor}` : "";
      setSyncMessage({ type: "success", text: `Imported ${importedCount} items.${nextCursorInfo}` });

      setCacheLoading(true);
      try {
        const statsRes = await fetch("/api/admin/mobile-feed-cache", { cache: "no-store" });
        if (statsRes.ok) {
          const statsJson = await statsRes.json();
          setCacheStats({
            count: Number(statsJson?.count || 0),
            lastImportedAt: typeof statsJson?.lastImportedAt === "string" ? statsJson.lastImportedAt : null,
          });
          setCacheError(null);
        }
      } finally {
        setCacheLoading(false);
      }
    } catch (err: any) {
      setSyncMessage({ type: "error", text: err?.message ?? "Failed to sync artworks" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    let active = true;
    const today = new Date();
    const startToday = today.toISOString().slice(0, 10);
    const startLast7 = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const loadOrders = async (start: string, end: string) => {
      const params = new URLSearchParams({ since: start, until: end });
      const res = await fetch(`/api/analytics/overview?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load orders snapshot");
      const json = await res.json();
      return {
        revenue: Number(json?.totals?.revenue || 0),
        count: Number(json?.totals?.orders || 0),
      };
    };

    const loadGa = async (start: string, end: string) => {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/analytics/ga4/overview?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load GA snapshot");
      const json = await res.json();
      if (!json?.ok && json?.code === "not_configured") {
        return { configured: false, required: json.required } as GaSnapshot;
      }
      if (!json?.ok) {
        return null;
      }
      return {
        configured: true,
        today: { sessions: Number(json.kpis.sessions || 0), activeUsers: Number(json.kpis.activeUsers || 0) },
        last7: { sessions: Number(json.kpis.sessions || 0), activeUsers: Number(json.kpis.activeUsers || 0) },
      } as GaSnapshot;
    };

    (async () => {
      try {
        const [todayOrders, last7Orders] = await Promise.all([
          loadOrders(startToday, startToday),
          loadOrders(startLast7, startToday),
        ]);
        if (active) setOrdersSnapshot({ today: todayOrders, last7: last7Orders });
      } catch {
        if (active) setOrdersSnapshot(null);
      }

      try {
        const todayParams = new URLSearchParams({ start: startToday, end: startToday });
        const last7Params = new URLSearchParams({ start: startLast7, end: startToday });

        const [todayGaRes, last7GaRes] = await Promise.all([
          fetch(`/api/analytics/ga4/overview?${todayParams.toString()}`, { cache: "no-store" }),
          fetch(`/api/analytics/ga4/overview?${last7Params.toString()}`, { cache: "no-store" }),
        ]);

        const todayGa = todayGaRes.ok ? await todayGaRes.json() : null;
        const last7Ga = last7GaRes.ok ? await last7GaRes.json() : null;

        if (todayGa?.ok && last7Ga?.ok) {
          const snapshot: GaSnapshot = {
            configured: true,
            today: {
              sessions: Number(todayGa.kpis.sessions || 0),
              activeUsers: Number(todayGa.kpis.activeUsers || 0),
            },
            last7: {
              sessions: Number(last7Ga.kpis.sessions || 0),
              activeUsers: Number(last7Ga.kpis.activeUsers || 0),
            },
          };
          if (active) setGaSnapshot(snapshot);
        } else if (todayGa?.code === "not_configured" || last7Ga?.code === "not_configured") {
          if (active) setGaSnapshot({ configured: false, required: todayGa?.required || last7Ga?.required });
        } else if (active) {
          setGaSnapshot(null);
        }
      } catch {
        if (active) setGaSnapshot(null);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const cards = [
    {
      label: "Orders today",
      value: metrics?.ordersTodayCount ?? 0,
      href: "/admin/orders",
    },
    {
      label: "Open payouts",
      value: metrics?.openPayoutArtistsCount ?? 0,
      href: "/admin/orders?filter=open_payouts",
    },
    {
      label: "Missing contract",
      value: metrics?.missingContractCount ?? 0,
      href: "/admin/artists?stage=Under%20Contract&filter=missing_contract",
    },
    {
      label: "Missing payout details",
      value: metrics?.missingPayoutDetailsCount ?? 0,
      href: "/admin/artists?stage=Under%20Contract&filter=missing_payout",
    },
  ];

  const snapshotRows = [
    {
      label: "Orders revenue",
      today: ordersSnapshot ? `€${ordersSnapshot.today.revenue.toFixed(0)}` : "–",
      last7: ordersSnapshot ? `€${ordersSnapshot.last7.revenue.toFixed(0)}` : "–",
    },
    {
      label: "Orders count",
      today: ordersSnapshot ? ordersSnapshot.today.count : "–",
      last7: ordersSnapshot ? ordersSnapshot.last7.count : "–",
    },
    {
      label: "Web sessions",
      today: gaSnapshot && gaSnapshot.configured ? gaSnapshot.today.sessions : gaSnapshot?.configured === false ? "Not configured" : "–",
      last7: gaSnapshot && gaSnapshot.configured ? gaSnapshot.last7.sessions : gaSnapshot?.configured === false ? "Not configured" : "–",
    },
    {
      label: "Web active users",
      today: gaSnapshot && gaSnapshot.configured ? gaSnapshot.today.activeUsers : gaSnapshot?.configured === false ? "Not configured" : "–",
      last7: gaSnapshot && gaSnapshot.configured ? gaSnapshot.last7.activeUsers : gaSnapshot?.configured === false ? "Not configured" : "–",
    },
  ];

  const lastSyncLabel = cacheLoading
    ? "…"
    : cacheStats?.lastImportedAt
      ? new Date(cacheStats.lastImportedAt).toLocaleString()
      : "Never";
  const cacheCountLabel = cacheLoading ? "…" : cacheStats ? cacheStats.count : "–";

  return (
    <div className="admin-dashboard">
      <header className="space-y-1">
        <p className="text-sm text-slate-500">Overview</p>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">Live metrics from Shopify cache and POS.</p>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="admin-cards-grid">
        {cards.map((card) => (
          <a key={card.label} href={card.href} className="admin-stat-card block transition hover:-translate-y-[1px]">
            <small>{card.label}</small>
            <strong>{loading && metrics === null ? "…" : card.value}</strong>
            <span className="text-xs text-slate-500 underline">View</span>
          </a>
        ))}
      </div>

      <div className="card acCard">
        <div className="cardHeader">
          <div>
            <p className="text-sm text-slate-500 m-0">Snapshot</p>
            <strong>Today vs last 7 days</strong>
          </div>
          {gaSnapshot?.configured === false && (
            <span className="text-xs text-slate-500">
              GA4 not configured — set GA4_PROPERTY_ID & GA4_SERVICE_ACCOUNT_JSON_BASE64
            </span>
          )}
        </div>
        <table className="ac-table">
          <thead>
            <tr>
              <th align="left">Metric</th>
              <th align="left">Today</th>
              <th align="left">Last 7 days</th>
            </tr>
          </thead>
          <tbody>
            {snapshotRows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.today}</td>
                <td>{row.last7}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!cacheHidden && (
        <div className="card acCard">
          <div className="cardHeader">
            <div>
              <p className="text-sm text-slate-500 m-0">Mobile Feed Cache</p>
              <strong>Cache status</strong>
            </div>
            <button className="ac-button" type="button" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                  Syncing…
                </>
              ) : (
                "Sync now"
              )}
            </button>
          </div>

          {cacheError && <p className="text-sm text-red-600">{cacheError}</p>}
          {syncMessage && (
            <p className={`text-sm ${syncMessage.type === "error" ? "text-red-600" : "text-emerald-600"}`}>
              {syncMessage.text}
            </p>
          )}

          <div className="acGrid2">
            <div className="space-y-1">
              <p className="text-sm text-slate-500 m-0">Last sync</p>
              <p className="text-lg font-semibold m-0">{lastSyncLabel}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-slate-500 m-0">Cached artworks</p>
              <p className="text-lg font-semibold m-0">{cacheCountLabel}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-slate-500">Data refreshes on page load.</p>
    </div>
  );
}
