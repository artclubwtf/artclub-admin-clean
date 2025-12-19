"use client";

import { useEffect, useState } from "react";

type Metrics = {
  ordersTodayCount: number;
  openPayoutArtistsCount: number;
  missingContractCount: number;
  missingPayoutDetailsCount: number;
};

export default function AdminDashboardClient() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <p className="text-sm text-slate-500">Data refreshes on page load.</p>
    </div>
  );
}
