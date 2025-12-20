"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type Ga4NotConfigured = { ok: false; code: "not_configured"; message: string; required: string[] };
type Ga4ErrorResponse = { ok: false; code: string; message: string; required?: string[] };
type Ga4Overview = {
  ok: true;
  range: { start: string; end: string };
  kpis: { activeUsers: number; newUsers: number; sessions: number; engagedSessions: number; engagementRate: number };
  geoTopCountries: { country: string; activeUsers: number; sessions: number }[];
  geoTopCities: { city: string; country: string; activeUsers: number; sessions: number }[];
  devices: { deviceCategory: string; activeUsers: number; sessions: number }[];
  sources: { sessionSourceMedium: string; activeUsers: number; sessions: number }[];
};
type Ga4Response = Ga4Overview | Ga4NotConfigured | Ga4ErrorResponse;

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

function formatPercent(value: number | undefined | null) {
  const safe = Number(value || 0);
  const normalized = safe > 1.2 ? safe : safe * 100;
  return `${Number.isFinite(normalized) ? normalized.toFixed(1) : "0.0"}%`;
}

function dateInputString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function AnalyticsPageClient() {
  const [range, setRange] = useState<RangeOption>(30);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [locations, setLocations] = useState<LocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaData, setGaData] = useState<Ga4Response | null>(null);
  const [gaLoading, setGaLoading] = useState(false);
  const [gaError, setGaError] = useState<string | null>(null);
  const [gaStart, setGaStart] = useState(() => dateInputString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [gaEnd, setGaEnd] = useState(() => dateInputString(new Date()));

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

  const fetchGaOverview = useCallback(async () => {
    setGaLoading(true);
    setGaError(null);
    try {
      const params = new URLSearchParams({ start: gaStart, end: gaEnd });
      const res = await fetch(`/api/analytics/ga4/overview?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.message || payload?.error || "Failed to load GA4 analytics");
      }
      const json = (await res.json()) as Ga4Response;
      setGaData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load GA4 analytics";
      setGaData(null);
      setGaError(message);
    } finally {
      setGaLoading(false);
    }
  }, [gaStart, gaEnd]);

  useEffect(() => {
    fetchGaOverview();
  }, [fetchGaOverview]);

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

  const gaCountries = gaData && gaData.ok ? gaData.geoTopCountries : [];
  const gaCities = gaData && gaData.ok ? gaData.geoTopCities : [];
  const gaDevices = gaData && gaData.ok ? gaData.devices : [];
  const gaSources = gaData && gaData.ok ? gaData.sources : [];

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

      <section className="acSection ga-section">
        <div className="acSectionHeader">
          <div>
            <p className="text-sm text-slate-500 m-0">Web Analytics</p>
            <h2 className="text-xl font-semibold m-0">GA4 overview</h2>
            <p className="text-sm text-slate-600 m-0">Server-side GA4 Data API (cached 10 min).</p>
          </div>
          <div className="ga-filters">
            <label className="ga-filter">
              <span>Start</span>
              <input type="date" value={gaStart} onChange={(e) => setGaStart(e.target.value)} />
            </label>
            <label className="ga-filter">
              <span>End</span>
              <input type="date" value={gaEnd} onChange={(e) => setGaEnd(e.target.value)} />
            </label>
            <button className="ac-button" type="button" onClick={fetchGaOverview} disabled={gaLoading}>
              {gaLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {gaError && <p className="text-sm text-red-600">{gaError}</p>}

        {gaData && gaData.ok === false && gaData.code === "not_configured" && (
          <div className="card ga-card">
            <p className="text-sm text-slate-500 m-0">GA4 not configured</p>
            <h3 className="text-lg font-semibold mt-1 mb-2">Set environment variables to enable reports.</h3>
            <ul className="list-disc pl-5 text-sm text-slate-600 m-0">
              {gaData.required.map((env) => (
                <li key={env}>{env}</li>
              ))}
            </ul>
          </div>
        )}

        {gaLoading && !gaData && (
          <div className="card ga-card">
            <p className="text-sm text-slate-500 m-0">Loading GA4 data…</p>
          </div>
        )}

        {gaData && gaData.ok && (
          <>
            <div className="admin-cards-grid">
              {[
                { label: "Active users", value: formatNumber(gaData.kpis.activeUsers) },
                { label: "New users", value: formatNumber(gaData.kpis.newUsers) },
                { label: "Sessions", value: formatNumber(gaData.kpis.sessions) },
                { label: "Engaged sessions", value: formatNumber(gaData.kpis.engagedSessions) },
                { label: "Engagement rate", value: formatPercent(gaData.kpis.engagementRate) },
              ].map((card) => (
                <div key={card.label} className="admin-stat-card">
                  <small>{card.label}</small>
                  <strong>{gaLoading ? "…" : card.value}</strong>
                </div>
              ))}
            </div>

            <div className="ga-table-grid">
              <div className="card ga-card">
                <div className="cardHeader">
                  <div>
                    <p className="text-sm text-slate-500 m-0">Countries</p>
                    <strong className="text-lg m-0">Top 10</strong>
                  </div>
                </div>
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th align="left">Country</th>
                      <th align="left">Active users</th>
                      <th align="left">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaCountries.length === 0 && (
                      <tr>
                        <td colSpan={3}>No data for this range.</td>
                      </tr>
                    )}
                    {gaCountries.map((row) => (
                      <tr key={row.country}>
                        <td>{row.country}</td>
                        <td>{formatNumber(row.activeUsers)}</td>
                        <td>{formatNumber(row.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card ga-card">
                <div className="cardHeader">
                  <div>
                    <p className="text-sm text-slate-500 m-0">Cities</p>
                    <strong className="text-lg m-0">Top 10</strong>
                  </div>
                </div>
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th align="left">City</th>
                      <th align="left">Country</th>
                      <th align="left">Active users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaCities.length === 0 && (
                      <tr>
                        <td colSpan={3}>No data for this range.</td>
                      </tr>
                    )}
                    {gaCities.map((row) => (
                      <tr key={`${row.country}-${row.city}`}>
                        <td>{row.city}</td>
                        <td className="text-slate-500">{row.country}</td>
                        <td>{formatNumber(row.activeUsers)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card ga-card">
                <div className="cardHeader">
                  <div>
                    <p className="text-sm text-slate-500 m-0">Devices</p>
                    <strong className="text-lg m-0">Top 10</strong>
                  </div>
                </div>
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th align="left">Device</th>
                      <th align="left">Active users</th>
                      <th align="left">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaDevices.length === 0 && (
                      <tr>
                        <td colSpan={3}>No data for this range.</td>
                      </tr>
                    )}
                    {gaDevices.map((row) => (
                      <tr key={row.deviceCategory}>
                        <td>{row.deviceCategory}</td>
                        <td>{formatNumber(row.activeUsers)}</td>
                        <td>{formatNumber(row.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card ga-card">
                <div className="cardHeader">
                  <div>
                    <p className="text-sm text-slate-500 m-0">Sources</p>
                    <strong className="text-lg m-0">Top 10</strong>
                  </div>
                </div>
                <table className="ga-table">
                  <thead>
                    <tr>
                      <th align="left">Source / Medium</th>
                      <th align="left">Active users</th>
                      <th align="left">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaSources.length === 0 && (
                      <tr>
                        <td colSpan={3}>No data for this range.</td>
                      </tr>
                    )}
                    {gaSources.map((row) => (
                      <tr key={row.sessionSourceMedium}>
                        <td>{row.sessionSourceMedium}</td>
                        <td>{formatNumber(row.activeUsers)}</td>
                        <td>{formatNumber(row.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
