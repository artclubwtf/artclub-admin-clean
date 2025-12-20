import { NextResponse } from "next/server";
import { protos } from "@google-analytics/data";
import { getGa4Client, getGa4Config } from "@/lib/ga4";

export const runtime = "nodejs";

type RunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type Row = protos.google.analytics.data.v1beta.IRow;

type MetricName = "activeUsers" | "newUsers" | "sessions" | "engagedSessions" | "engagementRate";
const METRICS: MetricName[] = ["activeUsers", "newUsers", "sessions", "engagedSessions", "engagementRate"];
const METRIC_INDEX: Record<MetricName, number> = {
  activeUsers: 0,
  newUsers: 1,
  sessions: 2,
  engagedSessions: 3,
  engagementRate: 4,
};

type CountryRow = { country: string; activeUsers: number; sessions: number };
type CityRow = { city: string; country: string; activeUsers: number; sessions: number };
type DeviceRow = { deviceCategory: string; activeUsers: number; sessions: number };
type SourceRow = { sessionSourceMedium: string; activeUsers: number; sessions: number };
type DemographicsResult = {
  available: boolean;
  reason?: string;
  age?: { bracket: string; activeUsers: number }[];
  gender?: { gender: string; activeUsers: number }[];
};

type Ga4OverviewOk = {
  ok: true;
  range: { start: string; end: string };
  kpis: { activeUsers: number; newUsers: number; sessions: number; engagedSessions: number; engagementRate: number };
  geoTopCountries: CountryRow[];
  geoTopCities: CityRow[];
  devices: DeviceRow[];
  sources: SourceRow[];
  demographics: DemographicsResult;
};

type Ga4NotConfigured = {
  ok: false;
  code: "not_configured";
  message: string;
  required: string[];
};

type Ga4OverviewResponse = Ga4OverviewOk | Ga4NotConfigured;

const cache = new Map<string, { ts: number; data: Ga4OverviewResponse }>();
const TTL_MS = 10 * 60 * 1000;
const REQUIRED_ENV = ["GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_JSON_BASE64"] as const;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(input: string | null, fallback: Date) {
  if (!input) return formatDate(fallback);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return formatDate(fallback);
  return formatDate(parsed);
}

function resolveRange(params: URLSearchParams) {
  const today = new Date();
  const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start = parseDateParam(params.get("start"), defaultStart);
  const end = parseDateParam(params.get("end"), today);
  return { start, end };
}

function numFromMetric(row: Row | null | undefined, metric: MetricName) {
  const raw = row?.metricValues?.[METRIC_INDEX[metric]]?.value;
  const value = raw !== undefined ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

function dimension(row: Row | null | undefined, index: number, fallback = "Unknown") {
  return row?.dimensionValues?.[index]?.value || fallback;
}

function buildBaseRequest(propertyId: string, start: string, end: string): RunReportRequest {
  return {
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: start, endDate: end }],
  };
}

function mapCountries(rows: Row[] | null | undefined): CountryRow[] {
  if (!rows) return [];
  return rows.map((row) => ({
    country: dimension(row, 0),
    activeUsers: numFromMetric(row, "activeUsers"),
    sessions: numFromMetric(row, "sessions"),
  }));
}

function mapCities(rows: Row[] | null | undefined): CityRow[] {
  if (!rows) return [];
  return rows.map((row) => ({
    city: dimension(row, 0),
    country: dimension(row, 1),
    activeUsers: numFromMetric(row, "activeUsers"),
    sessions: numFromMetric(row, "sessions"),
  }));
}

function mapDevices(rows: Row[] | null | undefined): DeviceRow[] {
  if (!rows) return [];
  return rows.map((row) => ({
    deviceCategory: dimension(row, 0),
    activeUsers: numFromMetric(row, "activeUsers"),
    sessions: numFromMetric(row, "sessions"),
  }));
}

function mapSources(rows: Row[] | null | undefined): SourceRow[] {
  if (!rows) return [];
  return rows.map((row) => ({
    sessionSourceMedium: dimension(row, 0),
    activeUsers: numFromMetric(row, "activeUsers"),
    sessions: numFromMetric(row, "sessions"),
  }));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { start, end } = resolveRange(searchParams);
    const cacheKey = `${start}:${end}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const config = getGa4Config();
    if (!config.ok || !config.propertyId) {
      const data: Ga4NotConfigured = {
        ok: false,
        code: "not_configured",
        message: "GA4 not configured",
        required: [...REQUIRED_ENV],
      };
      return NextResponse.json(data, { status: 200 });
    }

    const client = await getGa4Client();
    if (!client) {
      const data: Ga4NotConfigured = {
        ok: false,
        code: "not_configured",
        message: "GA4 not configured",
        required: [...REQUIRED_ENV],
      };
      return NextResponse.json(data, { status: 200 });
    }

    const baseRequest = buildBaseRequest(config.propertyId, start, end);
    const metrics = METRICS.map((name) => ({ name }));
    const orderBySessions = [{ metric: { metricName: "sessions" }, desc: true }];

    const [totalsResponse, countryResponse, cityResponse, deviceResponse, sourceResponse] = await Promise.all([
      client.runReport({ ...baseRequest, metrics, limit: 1 }),
      client.runReport({
        ...baseRequest,
        metrics,
        dimensions: [{ name: "country" }],
        orderBys: orderBySessions,
        limit: 10,
      }),
      client.runReport({
        ...baseRequest,
        metrics,
        dimensions: [{ name: "city" }, { name: "country" }],
        orderBys: orderBySessions,
        limit: 10,
      }),
      client.runReport({
        ...baseRequest,
        metrics,
        dimensions: [{ name: "deviceCategory" }],
        orderBys: orderBySessions,
        limit: 10,
      }),
      client.runReport({
        ...baseRequest,
        metrics,
        dimensions: [{ name: "sessionSourceMedium" }],
        orderBys: orderBySessions,
        limit: 10,
      }),
    ]);

    const totalsRow = totalsResponse[0]?.rows?.[0];
    const kpis = {
      activeUsers: numFromMetric(totalsRow, "activeUsers"),
      newUsers: numFromMetric(totalsRow, "newUsers"),
      sessions: numFromMetric(totalsRow, "sessions"),
      engagedSessions: numFromMetric(totalsRow, "engagedSessions"),
      engagementRate: numFromMetric(totalsRow, "engagementRate"),
    };

    let demographics: DemographicsResult = { available: false, reason: "unavailable_or_thresholded" };
    try {
      const [ageResponse, genderResponse] = await Promise.all([
        client.runReport({
          ...baseRequest,
          metrics: [{ name: "activeUsers" }],
          dimensions: [{ name: "userAgeBracket" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: 10,
        }),
        client.runReport({
          ...baseRequest,
          metrics: [{ name: "activeUsers" }],
          dimensions: [{ name: "userGender" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: 10,
        }),
      ]);

      const ageRows = ageResponse[0]?.rows || [];
      const genderRows = genderResponse[0]?.rows || [];
      const age = ageRows.map((row) => ({
        bracket: dimension(row, 0),
        activeUsers: numFromMetric(row, "activeUsers"),
      }));
      const gender = genderRows.map((row) => ({
        gender: dimension(row, 0),
        activeUsers: numFromMetric(row, "activeUsers"),
      }));

      if (age.length > 0 || gender.length > 0) {
        demographics = { available: true, age, gender };
      }
    } catch {
      demographics = { available: false, reason: "unavailable_or_thresholded" };
    }

    const data: Ga4OverviewOk = {
      ok: true,
      range: { start, end },
      kpis,
      geoTopCountries: mapCountries(countryResponse[0]?.rows),
      geoTopCities: mapCities(cityResponse[0]?.rows),
      devices: mapDevices(deviceResponse[0]?.rows),
      sources: mapSources(sourceResponse[0]?.rows),
      demographics,
    };

    cache.set(cacheKey, { ts: Date.now(), data });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load GA4 analytics";
    return NextResponse.json({ ok: false, code: "error", message }, { status: 500 });
  }
}
