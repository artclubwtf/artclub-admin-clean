import { BetaAnalyticsDataClient } from "@google-analytics/data";

export type Ga4Client = BetaAnalyticsDataClient;

type Ga4Config = { propertyId?: string; ok: boolean; reason?: string };

let clientPromise: Promise<Ga4Client | null> | null = null;

function decodeServiceAccount(): { client_email?: string; private_key?: string; project_id?: string } | null {
  const encoded = process.env.GA4_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) return null;
  try {
    const jsonString = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(jsonString) as { client_email?: string; private_key?: string; project_id?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getGa4Config(): Ga4Config {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) return { ok: false, reason: "missing_property_id" };
  if (!process.env.GA4_SERVICE_ACCOUNT_JSON_BASE64) {
    return { ok: false, propertyId, reason: "missing_service_account" };
  }
  return { ok: true, propertyId };
}

export async function getGa4Client(): Promise<Ga4Client | null> {
  if (clientPromise) return clientPromise;

  const cfg = getGa4Config();
  if (!cfg.ok || !cfg.propertyId) return null;

  clientPromise = (async () => {
    const credentials = decodeServiceAccount();
    if (!credentials?.client_email || !credentials?.private_key) return null;
    try {
      const client = new BetaAnalyticsDataClient({
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key,
        },
        projectId: credentials.project_id,
      });
      return client;
    } catch {
      return null;
    }
  })();

  return clientPromise;
}
