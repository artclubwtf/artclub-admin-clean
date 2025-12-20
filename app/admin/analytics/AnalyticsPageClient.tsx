"use client";

import { useEffect, useMemo, useState } from "react";

type OverviewResponse = {
  totals: { revenue: number; orders: number; aov: number };
  split: { printsRevenue: number; originalsRevenue: number; unknownRevenue: number };
  updatedAt: string;
};

type LocationsResponse = {
  countries: { country: string; orders: number; revenue: number }[];
  cities: { country: string; city: string; orders: number; revenue: number }[];
  updatedAt?: string;
};

type RangeOption = 7 | 30 | 90;

const currencyFormatter = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("de-DE");

function formatCurrency(value: number | undefined | null) {
  const safe = Number(value || 0);
  return currencyFormatter.format(Number.isFinite(safe) ? safe : 0);
}

function formatNumber(value: number | undefined | null) {
  const safe = Number(value || 0);
  return numberFormatter.format(Number.isFinite(safe) ? safe : 0);
}

export default function AnalyticsPageClient() {
  const [range, setRange] = useState<RangeOption>(30);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [locations, setLocations] = useState<LocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sinceIso, untilIso } = useMemo(() => {
    const now = new Date();
    const since = new Date(now.getTime() - range * 24 * 60 * 60 * 1000);
    return {
      sinceIso: since.toISOString(),
      untilIso: now.toISOString(),
    };
  }, [range]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ since: sinceIso, until: untilIso });
        const [overviewRes, locationsRes] = await Promise.all([
          fetch(`/api/analytics/overview?${params.toString()}`, { cache: "no-store" }),
          fetch(`/api/analytics/locations?${params.toString()}&limit=8`, { cache: "no-store" }),
        ]);

        if (!overviewRes.ok) {
          const payload = await overviewRes.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load overview");
        }
        if (!locationsRes.ok) {
          const payload = await locationsRes.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load locations");
        }

        const [overviewJson, locationsJson] = await Promise.all([overviewRes.json(), locationsRes.json()]);
        if (!active) return;
        setOverview(overviewJson as OverviewResponse);
        setLocations(locationsJson as LocationsResponse);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load analytics";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [sinceIso, untilIso]);

  const rangeOptions: { label: string; value: RangeOption }[] = [
    { label: "Last 7 days", value: 7 },
    { label: "Last 30 days", value: 30 },
    { label: "Last 90 days", value: 90 },
  ];

  const renderKpiCards = () => {
    const cards = [
      {
        label: "Total revenue",
        value: overview ? formatCurrency(overview.totals.revenue) : "…",
        helper: overview ? "Includes Shopify + POS" : "Loading…",
      },
      {
        label: "Total orders",
        value: overview ? formatNumber(overview.totals.orders) : "…",
        helper: overview ? "Completed + POS" : "Loading…",
      },
      {
        label: "Avg order value",
        value: overview ? formatCurrency(overview.totals.aov) : "…",
        helper: overview ? "Revenue / orders" : "Loading…",
      },
      {
        label: "Prints vs originals",
        value: overview ? `${formatCurrency(overview.split.printsRevenue)} prints` : "…",
        helper: overview
          ? `${formatCurrency(overview.split.originalsRevenue)} originals · ${formatCurrency(overview.split.unknownRevenue)} unknown`
          : "Loading…",
      },
    ];

    return (
      <div className="admin-cards-grid">
        {cards.map((card) => (
          <div key={card.label} className="admin-stat-card">
            <small>{card.label}</small>
            <strong>{loading ? "…" : card.value}</strong>
            <p className="text-xs text-slate-500 m-0">{card.helper}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderTable = (
    title: string,
    rows: { label: string; subLabel?: string; orders: number; revenue: number }[],
    emptyLabel: string,
  ) => (
    <div className="card">
      <div className="cardHeader">
        <div>
          <p className="text-sm text-slate-500 m-0">{title}</p>
          <strong className="text-lg">{loading ? "…" : ""}</strong>
        </div>
      </div>
      <div className="ac-divider" />
      <table className="ac-table">
        <thead>
          <tr>
            <th align="left">{title.includes("City") ? "City" : "Country"}</th>
            <th align="left">Orders</th>
            <th align="left">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={3}>Loading…</td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={3}>{emptyLabel}</td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr key={row.label + row.subLabel}>
                <td>
                  <div className="flex flex-col">
                    <span>{row.label}</span>
                    {row.subLabel && <small className="text-slate-500">{row.subLabel}</small>}
                  </div>
                </td>
                <td>{formatNumber(row.orders)}</td>
                <td>{formatCurrency(row.revenue)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const countryRows =
    locations?.countries?.map((c) => ({
      label: c.country,
      orders: c.orders,
      revenue: c.revenue,
    })) ?? [];

  const cityRows =
    locations?.cities?.map((c) => ({
      label: c.city,
      subLabel: c.country,
      orders: c.orders,
      revenue: c.revenue,
    })) ?? [];

  return (
    <div className="admin-dashboard">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-500">Sales analytics</p>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-slate-600">Pulling from Shopify cache and POS orders.</p>
        </div>
        <div className="segmented" role="group" aria-label="Select timeframe">
          {rangeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={opt.value === range ? "active" : ""}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {renderKpiCards()}

      <section className="acSection">
        <div className="acSectionHeader">
          <div>
            <p className="text-sm text-slate-500 m-0">Locations</p>
            <h2 className="text-xl font-semibold m-0">Top regions</h2>
          </div>
          {overview?.updatedAt && (
            <span className="ac-badge">Updated {new Date(overview.updatedAt).toLocaleString()}</span>
          )}
        </div>
        <div className="acGrid2">
          {renderTable("Countries", countryRows, "No orders in this range")}
          {renderTable("Cities", cityRows, "No city data yet")}
        </div>
      </section>
    </div>
  );
}
