import { createHmac, timingSafeEqual } from "crypto";

import type { CreateTerminalPaymentInput, TerminalPaymentProvider, TerminalPaymentStatus } from "@/lib/pos/terminalPayments";

type VerifoneAuthMode = "oauth" | "apikey";

type VerifoneConfig = {
  apiBaseUrl: string;
  merchantId?: string;
  authMode: VerifoneAuthMode;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  webhookSecret?: string;
  terminalCommandMode: string;
};

type OAuthTokenCache = {
  token: string;
  expiresAt: number;
} | null;

let oauthTokenCache: OAuthTokenCache = null;

function getConfig(): VerifoneConfig {
  const apiBaseUrl = process.env.VERIFONE_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    throw new Error("missing_verifone_api_base_url");
  }

  const authMode = (process.env.VERIFONE_AUTH_MODE?.trim().toLowerCase() || "oauth") as VerifoneAuthMode;
  const merchantId = process.env.VERIFONE_MERCHANT_ID?.trim() || undefined;
  const terminalCommandMode = process.env.VERIFONE_TERMINAL_COMMAND_MODE?.trim().toLowerCase() || "cloud";

  if (authMode === "oauth") {
    const clientId = process.env.VERIFONE_CLIENT_ID?.trim();
    const clientSecret = process.env.VERIFONE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new Error("missing_verifone_oauth_credentials");
    }
    return {
      apiBaseUrl,
      merchantId,
      authMode,
      clientId,
      clientSecret,
      webhookSecret: process.env.VERIFONE_WEBHOOK_SECRET?.trim() || undefined,
      terminalCommandMode,
    };
  }

  const apiKey = process.env.VERIFONE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("missing_verifone_api_key");
  }
  return {
    apiBaseUrl,
    merchantId,
    authMode: "apikey",
    apiKey,
    webhookSecret: process.env.VERIFONE_WEBHOOK_SECRET?.trim() || undefined,
    terminalCommandMode,
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function mapUnknownStatusToInternal(statusValue: unknown): TerminalPaymentStatus {
  const raw = String(statusValue || "")
    .trim()
    .toLowerCase();

  if (!raw) return "payment_pending";

  if (["paid", "approved", "captured", "completed", "success", "successful", "settled"].includes(raw)) {
    return "paid";
  }
  if (["failed", "declined", "error", "rejected"].includes(raw)) {
    return "failed";
  }
  if (["cancelled", "canceled", "voided", "aborted"].includes(raw)) {
    return "cancelled";
  }
  if (["refunded", "refund", "partially_refunded", "partial_refund"].includes(raw)) {
    return "refunded";
  }
  return "payment_pending";
}

function resolveStatusFromRaw(raw: unknown): TerminalPaymentStatus {
  const root = asObject(raw);
  if (!root) return "payment_pending";
  const data = asObject(root.data);
  const payment = asObject(root.payment);
  const candidates = [
    root.status,
    root.paymentStatus,
    root.transactionStatus,
    root.state,
    root.result,
    data?.status,
    data?.paymentStatus,
    payment?.status,
    payment?.state,
  ];

  for (const candidate of candidates) {
    const mapped = mapUnknownStatusToInternal(candidate);
    if (mapped !== "payment_pending") return mapped;
  }
  return "payment_pending";
}

function resolveProviderTxId(raw: unknown) {
  const root = asObject(raw);
  if (!root) return null;
  const data = asObject(root.data);
  const payment = asObject(root.payment);
  const candidates = [
    root.providerTxId,
    root.transactionId,
    root.paymentId,
    root.id,
    data?.id,
    data?.transactionId,
    payment?.id,
    payment?.transactionId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

async function getOAuthToken(config: VerifoneConfig) {
  const now = Date.now();
  if (oauthTokenCache && oauthTokenCache.expiresAt > now + 5_000) {
    return oauthTokenCache.token;
  }

  const tokenUrl = new URL("/oauth/token", config.apiBaseUrl).toString();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId || "",
    client_secret: config.clientSecret || "",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await response.text();
  const parsedRaw = safeJsonParse(text);
  const parsed = asObject(parsedRaw) || {};
  if (!response.ok) {
    throw new Error(`verifone_oauth_failed:${response.status}`);
  }

  const accessToken = parsed.access_token;
  const expiresIn = Number(parsed.expires_in || 300);
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("verifone_oauth_missing_access_token");
  }

  oauthTokenCache = {
    token: accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
  };
  return accessToken;
}

async function buildAuthHeaders(config: VerifoneConfig): Promise<Record<string, string>> {
  if (config.authMode === "apikey") {
    return {
      "x-api-key": config.apiKey || "",
    };
  }
  const token = await getOAuthToken(config);
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function verifoneRequest(params: {
  config: VerifoneConfig;
  method: "GET" | "POST";
  path: string;
  idempotencyKey?: string;
  body?: unknown;
}) {
  const authHeaders = await buildAuthHeaders(params.config);
  const url = new URL(params.path, params.config.apiBaseUrl).toString();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders,
  };

  if (params.idempotencyKey) {
    headers["Idempotency-Key"] = params.idempotencyKey;
  }

  let body: string | undefined;
  if (params.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(params.body);
  }

  const response = await fetch(url, {
    method: params.method,
    headers,
    body,
  });
  const text = await response.text();
  const raw = safeJsonParse(text);
  if (!response.ok) {
    throw new Error(`verifone_request_failed:${response.status}`);
  }
  return raw;
}

function buildMerchantPrefix(config: VerifoneConfig) {
  return config.merchantId ? `/v1/merchants/${encodeURIComponent(config.merchantId)}` : "/v1";
}

export class VerifoneProvider implements TerminalPaymentProvider {
  async createPayment(input: CreateTerminalPaymentInput) {
    const config = getConfig();
    const merchantPrefix = buildMerchantPrefix(config);
    const path = `${merchantPrefix}/payments`;

    const raw = await verifoneRequest({
      config,
      method: "POST",
      path,
      idempotencyKey: input.referenceId,
      body: {
        amount: {
          value: input.amountCents,
          currency: input.currency,
        },
        referenceId: input.referenceId,
        terminalRef: input.terminalRef,
        commandMode: config.terminalCommandMode,
        metadata: input.metadata || {},
      },
    });

    const providerTxId = resolveProviderTxId(raw);
    if (!providerTxId) {
      throw new Error("verifone_missing_provider_tx_id");
    }

    return {
      providerTxId,
      status: resolveStatusFromRaw(raw),
      raw,
    };
  }

  async getPaymentStatus(providerTxId: string) {
    const config = getConfig();
    const merchantPrefix = buildMerchantPrefix(config);
    const path = `${merchantPrefix}/payments/${encodeURIComponent(providerTxId)}`;

    const raw = await verifoneRequest({
      config,
      method: "GET",
      path,
    });
    return {
      status: resolveStatusFromRaw(raw),
      raw,
    };
  }

  async cancelPayment(providerTxId: string) {
    const config = getConfig();
    const merchantPrefix = buildMerchantPrefix(config);
    const path = `${merchantPrefix}/payments/${encodeURIComponent(providerTxId)}/cancel`;

    await verifoneRequest({
      config,
      method: "POST",
      path,
      body: {},
    });
  }

  async refundPayment(providerTxId: string, amountCents?: number) {
    const config = getConfig();
    const merchantPrefix = buildMerchantPrefix(config);
    const path = `${merchantPrefix}/payments/${encodeURIComponent(providerTxId)}/refunds`;
    const refundReference = `${providerTxId}:${amountCents ?? "full"}`;

    await verifoneRequest({
      config,
      method: "POST",
      path,
      idempotencyKey: refundReference,
      body: {
        amount: amountCents
          ? {
              value: amountCents,
              currency: "EUR",
            }
          : undefined,
      },
    });
  }
}

export function validateVerifoneWebhookSignature(rawBody: string, signatureHeader: string | null | undefined) {
  const secret = process.env.VERIFONE_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length === 0 || providedBuffer.length === 0) return false;
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
