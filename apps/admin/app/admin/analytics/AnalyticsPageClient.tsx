"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
type Ga4Compare = { current: Ga4Overview | null; previous: Ga4Overview | null };

type Ga4Status =
  | { ok: true; configured: true; propertyId: string; cacheTtlMinutes: number }
  | { ok: true; configured: false; required: string[] };

type RangeOption = 7 | 30 | 90;
type TabKey = "sales" | "web";

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

function percentDelta(current: number, previous: number | null | undefined) {
  if (!previous || previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  if (!Number.isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function dateInputString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDateInput(value: string | null, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return dateInputString(parsed);
}

export default function AnalyticsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [range, setRange] = useState<RangeOption>(30);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [locations, setLocations] = useState<LocationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaData, setGaData] = useState<Ga4Response | null>(null);
  const [gaLoading, setGaLoading] = useState(false);
  const [gaError, setGaError] = useState<string | null>(null);
  const [gaCompare, setGaCompare] = useState<Ga4Compare>({ current: null, previous: null });
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [gaStatus, setGaStatus] = useState<Ga4Status | null>(null);
  const defaultGaStart = dateInputString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const defaultGaEnd = dateInputString(new Date());
  const [tab, setTab] = useState<TabKey>(() => (searchParams?.get("tab") === "web" ? "web" : "sales"));
  const [gaStart, setGaStart] = useState(() => normalizeDateInput(searchParams?.get("start"), defaultGaStart));
  const [gaEnd, setGaEnd] = useState(() => normalizeDateInput(searchParams?.get("end"), defaultGaEnd));

  const { sinceIso, untilIso } = useMemo(() => {
    const now = new Date();
    const since = new Date(now.getTime() - range * 24 * 60 * 60 * 1000);
    return {
      sinceIso: since.toISOString(),
      untilIso: now.toISOString(),
    };
  }, [range]);

  useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("start", gaStart);
    params.set("end", gaEnd);
    if (compareEnabled) params.set("compare", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [tab, gaStart, gaEnd, compareEnabled, router, pathname]);

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

      if (compareEnabled) {
        const startDate = new Date(gaStart);
        const endDate = new Date(gaEnd);
        const diff = endDate.getTime() - startDate.getTime();
        const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        const prevStart = new Date(prevEnd.getTime() - diff);

        const prevParams = new URLSearchParams({
          start: dateInputString(prevStart),
          end: dateInputString(prevEnd),
        });
        const prevRes = await fetch(`/api/analytics/ga4/overview?${prevParams.toString()}`, { cache: "no-store" });
        if (prevRes.ok) {
          const prevJson = (await prevRes.json()) as Ga4Response;
          if (prevJson && prevJson.ok) {
            setGaCompare({ current: json.ok ? json : null, previous: prevJson });
          } else {
            setGaCompare({ current: json.ok ? json : null, previous: null });
          }
        } else {
          setGaCompare({ current: json.ok ? json : null, previous: null });
        }
      } else {
        setGaCompare({ current: json.ok ? json : null, previous: null });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load GA4 analytics";
      setGaData(null);
      setGaError(message);
      setGaCompare({ current: null, previous: null });
    } finally {
      setGaLoading(false);
    }
  }, [gaStart, gaEnd, compareEnabled]);

  useEffect(() => {
    if (tab !== "web") return;
    fetchGaOverview();
  }, [fetchGaOverview, tab]);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/analytics/ga4/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Ga4Status;
        setGaStatus(json);
      } catch {
        /* ignore */
      }
    };
    loadStatus();
  }, []);

  const rangeOptions: { label: string; value: RangeOption }[] = [
    { label: "Last 7 days", value: 7 },
    { label: "Last 30 days", value: 30 },
    { label: "Last 90 days", value: 90 },
  ];
  const tabOptions: { label: string; value: TabKey }[] = [
    { label: "Sales", value: "sales" },
    { label: "Web", value: "web" },
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
          <p className="text-sm text-slate-500">{tab === "sales" ? "Sales analytics" : "Web analytics"}</p>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-slate-600">
            {tab === "sales" ? "Pulling from Shopify cache and POS orders." : "Server-side GA4 Data API (cached 10 min)."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <div className="segmented" role="tablist" aria-label="Select analytics view">
            {tabOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={opt.value === tab ? "active" : ""}
                onClick={() => setTab(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {tab === "sales" && (
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
          )}
        </div>
      </header>

      {tab === "sales" && (
        <>
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
        </>
      )}

      {tab === "web" && (
        <section className="acSection ga-section">
          <div className="ga-status">
            {gaStatus?.configured ? (
              <div className="ga-status-pill ga-status-ok">
                <span className="ga-dot" />
                Configured · Property {gaStatus.propertyId} · Cache {gaStatus.cacheTtlMinutes}m
              </div>
            ) : (
              <div className="ga-status-pill ga-status-warn">
                <span className="ga-dot" />
                Not configured · Set {gaStatus?.configured === false ? gaStatus.required.join(", ") : "GA4 env vars"}
              </div>
            )}
          </div>
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
              <label className="ga-filter ga-filter-inline">
                <span>Compare to previous</span>
                <input
                  type="checkbox"
                  checked={compareEnabled}
                  onChange={(e) => setCompareEnabled(e.target.checked)}
                />
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
                {(gaData.required || []).map((env) => (
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
                  {
                    label: "Active users",
                    value: formatNumber(gaData.kpis.activeUsers),
                    delta: gaCompare.previous ? percentDelta(gaData.kpis.activeUsers, gaCompare.previous.kpis.activeUsers) : null,
                  },
                  {
                    label: "New users",
                    value: formatNumber(gaData.kpis.newUsers),
                    delta: gaCompare.previous ? percentDelta(gaData.kpis.newUsers, gaCompare.previous.kpis.newUsers) : null,
                  },
                  {
                    label: "Sessions",
                    value: formatNumber(gaData.kpis.sessions),
                    delta: gaCompare.previous ? percentDelta(gaData.kpis.sessions, gaCompare.previous.kpis.sessions) : null,
                  },
                  {
                    label: "Engaged sessions",
                    value: formatNumber(gaData.kpis.engagedSessions),
                    delta: gaCompare.previous ? percentDelta(gaData.kpis.engagedSessions, gaCompare.previous.kpis.engagedSessions) : null,
                  },
                  {
                    label: "Engagement rate",
                    value: formatPercent(gaData.kpis.engagementRate),
                    delta: gaCompare.previous ? percentDelta(gaData.kpis.engagementRate, gaCompare.previous.kpis.engagementRate) : null,
                  },
                ].map((card) => (
                  <div key={card.label} className="admin-stat-card">
                    <small>{card.label}</small>
                    <strong>{gaLoading ? "…" : card.value}</strong>
                    {card.delta && <p className="text-xs text-slate-500 m-0">vs prev: {card.delta}</p>}
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
      )}
    </div>
  );
}
