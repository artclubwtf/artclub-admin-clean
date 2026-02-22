import { createHash } from "crypto";

type ExistingTseState = {
  txId?: string | null;
  signature?: string | null;
  serial?: string | null;
  rawPayload?: unknown;
};

export type FiskalyTSETransactionContext = {
  txId: string;
  amountCents: number;
  currency: string;
  tseTxId?: string;
  existingTse?: ExistingTseState | null;
};

export type FiskalyTSEStartResult = {
  tseTxId: string;
  serial: string;
  startedAt?: Date;
  raw?: unknown;
};

export type FiskalyTSEFinishResult = {
  signature: string;
  signatureCounter: number;
  logTime: Date;
  finishedAt?: Date;
  raw?: unknown;
};

type FiskalyConfig = {
  env: "sandbox" | "production";
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  tssId: string;
  clientId: string;
};

type AuthTokenState = {
  token: string;
  expiresAt: number;
  cacheKey: string;
};

let authTokenCache: AuthTokenState | null = null;

function trimOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getFiskalyBaseUrl(env: "sandbox" | "production", override?: string | null) {
  const raw = trimOptional(override);
  if (raw) {
    const normalized = raw.replace(/\/+$/, "");
    return normalized.endsWith("/api/v2") ? normalized : `${normalized}/api/v2`;
  }

  if (env === "production") return "https://kassensichv.fiskaly.com/api/v2";
  return "https://kassensichv-sandbox.fiskaly.com/api/v2";
}

function requireConfig(): FiskalyConfig {
  const env = (trimOptional(process.env.FISKALY_ENV)?.toLowerCase() === "production" ? "production" : "sandbox") as
    | "sandbox"
    | "production";
  const apiKey = trimOptional(process.env.FISKALY_API_KEY);
  const apiSecret = trimOptional(process.env.FISKALY_API_SECRET);
  const tssId = trimOptional(process.env.FISKALY_TSS_ID);
  const clientId = trimOptional(process.env.FISKALY_CLIENT_ID);

  if (!apiKey || !apiSecret) {
    throw new Error("fiskaly_not_configured:missing_api_key_or_secret");
  }
  if (!tssId) {
    throw new Error("fiskaly_not_configured:missing_tss_id");
  }
  if (!clientId) {
    throw new Error("fiskaly_not_configured:missing_client_id");
  }

  return {
    env,
    baseUrl: getFiskalyBaseUrl(env, process.env.FISKALY_API_BASE_URL),
    apiKey,
    apiSecret,
    tssId,
    clientId,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function nextRevisionFromRaw(rawPayload: unknown, fallback = 1) {
  const raw = asRecord(rawPayload);
  const finish = asRecord(raw.finish);
  const current = asRecord(raw.current);
  const start = asRecord(raw.start);
  const candidate =
    pickNumber(current, ["tx_revision", "revision"]) ??
    pickNumber(finish, ["tx_revision", "revision"]) ??
    pickNumber(start, ["tx_revision", "revision"]);
  if (typeof candidate === "number") return candidate + 1;
  return fallback;
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
}

function summarizeErrorPayload(payload: unknown) {
  const record = asRecord(payload);
  const errorRecord = asRecord(record.error);
  const detailsRecord = asRecord(record.details);

  const parts = [
    pickString(record, ["message", "error"]),
    pickString(errorRecord, ["message", "type", "code"]),
    pickString(detailsRecord, ["message", "code"]),
    pickString(record, ["code", "type"]),
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" | ");

  const text = JSON.stringify(payload);
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

function describeFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown_fetch_error");
  return message.replace(/\s+/g, " ").trim();
}

async function getAuthToken(config: FiskalyConfig) {
  const cacheKey = createHash("sha256").update(`${config.baseUrl}|${config.apiKey}|${config.apiSecret}`).digest("hex");
  const now = Date.now();
  if (authTokenCache && authTokenCache.cacheKey === cacheKey && authTokenCache.expiresAt - 15_000 > now) {
    return authTokenCache.token;
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(`fiskaly_network_error:auth:${config.baseUrl}/auth:${describeFetchError(error)}`);
  }
  const json = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(`fiskaly_auth_failed:${res.status}:${summarizeErrorPayload(json)}`);
  }
  const record = asRecord(json);
  const accessToken = pickString(record, ["access_token", "token"]);
  if (!accessToken) {
    throw new Error("fiskaly_auth_failed:missing_access_token");
  }
  const expiresInSeconds = pickNumber(record, ["expires_in", "expiresIn"]) ?? 300;
  authTokenCache = {
    token: accessToken,
    expiresAt: now + Math.max(60, expiresInSeconds) * 1000,
    cacheKey,
  };
  return accessToken;
}

async function fiskalyRequest(config: FiskalyConfig, path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const token = await getAuthToken(config);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (init.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(`fiskaly_network_error:api:${path}:${describeFetchError(error)}`);
  }
  const json = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(`fiskaly_api_error:${res.status}:${path}:${summarizeErrorPayload(json)}`);
  }
  return json;
}

function buildStartPayload(ctx: FiskalyTSETransactionContext, config: FiskalyConfig) {
  const gross = Math.max(0, ctx.amountCents);
  const major = gross / 100;
  return {
    state: "ACTIVE",
    client_id: config.clientId,
    schema: "standard_v1",
    // Minimal generic process data for TSE signing. Can be extended later with exact DSFinV-K process strings.
    process_type: "Kassenbeleg-V1",
    process_data: `TX ${ctx.txId} ${major.toFixed(2)} ${ctx.currency || "EUR"}`,
    amounts_per_vat_rate: [
      {
        vat_rate: "NORMAL",
        amount: Number(major.toFixed(2)),
      },
    ],
  };
}

function buildFinishPayload(ctx: FiskalyTSETransactionContext, config: FiskalyConfig) {
  const gross = Math.max(0, ctx.amountCents);
  const major = gross / 100;
  return {
    state: "FINISHED",
    client_id: config.clientId,
    schema: "standard_v1",
    process_type: "Kassenbeleg-V1",
    process_data: `TX ${ctx.txId} ${major.toFixed(2)} ${ctx.currency || "EUR"} PAID`,
    amounts_per_vat_rate: [
      {
        vat_rate: "NORMAL",
        amount: Number(major.toFixed(2)),
      },
    ],
  };
}

function buildCancelPayload(ctx: FiskalyTSETransactionContext, config: FiskalyConfig) {
  return {
    state: "CANCELLED",
    client_id: config.clientId,
    schema: "standard_v1",
    process_type: "Kassenbeleg-V1",
    process_data: `TX ${ctx.txId} CANCELLED`,
    amounts_per_vat_rate: [],
  };
}

function mapStartResult(ctx: FiskalyTSETransactionContext, json: unknown): FiskalyTSEStartResult {
  const record = asRecord(json);
  const serial =
    pickString(record, ["tss_serial_number", "serial_number", "serial"]) ||
    ctx.existingTse?.serial ||
    "FISKALY-SIGN-DE";
  const startedAt = parseDate(record.time_start) || parseDate(record.created_at) || new Date();
  const tseTxId = pickString(record, ["_id", "id", "tx_id", "transaction_id"]) || ctx.txId;
  return { tseTxId, serial, startedAt, raw: json };
}

function mapFinishResult(ctx: FiskalyTSETransactionContext, json: unknown): FiskalyTSEFinishResult {
  const record = asRecord(json);
  const signature = pickString(record, ["signature", "signature_base64", "tse_signature"]);
  if (!signature) {
    throw new Error("fiskaly_finish_failed:missing_signature");
  }
  const signatureCounter =
    pickNumber(record, ["signature_counter", "signatureCounter", "log_message_serial_number"]) ?? 0;
  const logTime =
    parseDate(record.time_end) || parseDate(record.time_finish) || parseDate(record.log_time) || new Date();
  const finishedAt = parseDate(record.time_end) || parseDate(record.time_finish) || new Date();
  void ctx;
  return { signature, signatureCounter, logTime, finishedAt, raw: json };
}

export class FiskalySignDeProvider {
  private get config() {
    return requireConfig();
  }

  async ping() {
    const config = this.config;
    await getAuthToken(config);
    return { ok: true as const, provider: "fiskaly" as const, env: config.env };
  }

  async startTransaction(ctx: FiskalyTSETransactionContext): Promise<FiskalyTSEStartResult> {
    if (ctx.existingTse?.txId) {
      return {
        tseTxId: ctx.existingTse.txId,
        serial: ctx.existingTse.serial || "FISKALY-SIGN-DE",
        raw: asRecord(ctx.existingTse.rawPayload).start || ctx.existingTse.rawPayload || null,
      };
    }

    const config = this.config;
    const txId = ctx.tseTxId || ctx.txId;
    const json = await fiskalyRequest(
      config,
      `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(txId)}?tx_revision=1`,
      {
        method: "PUT",
        body: JSON.stringify(buildStartPayload(ctx, config)),
        idempotencyKey: ctx.txId,
      },
    );
    return mapStartResult(ctx, json);
  }

  async finishTransaction(ctx: FiskalyTSETransactionContext): Promise<FiskalyTSEFinishResult> {
    if (ctx.existingTse?.signature) {
      return {
        signature: ctx.existingTse.signature,
        signatureCounter: 0,
        logTime: new Date(),
        raw: asRecord(ctx.existingTse.rawPayload).finish || ctx.existingTse.rawPayload || null,
      };
    }

    const config = this.config;
    const txId = ctx.tseTxId || ctx.existingTse?.txId || ctx.txId;
    let revision = nextRevisionFromRaw(ctx.existingTse?.rawPayload, 2);

    // Try to fetch current transaction state if revision is unknown or stale.
    try {
      const current = await fiskalyRequest(config, `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(txId)}`, {
        method: "GET",
      });
      const currentRecord = asRecord(current);
      const currentRevision = pickNumber(currentRecord, ["tx_revision", "revision"]);
      if (typeof currentRevision === "number") {
        revision = currentRevision + 1;
      }
    } catch {
      // Non-fatal. We'll continue with computed revision.
    }

    const json = await fiskalyRequest(
      config,
      `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(txId)}?tx_revision=${encodeURIComponent(String(revision))}`,
      {
        method: "PUT",
        body: JSON.stringify(buildFinishPayload(ctx, config)),
        idempotencyKey: `${ctx.txId}:finish`,
      },
    );
    return mapFinishResult(ctx, json);
  }

  async cancelTransaction(ctx: FiskalyTSETransactionContext): Promise<void> {
    if (!ctx.tseTxId && !ctx.existingTse?.txId) {
      return;
    }

    const config = this.config;
    const txId = ctx.tseTxId || ctx.existingTse?.txId || ctx.txId;
    let revision = nextRevisionFromRaw(ctx.existingTse?.rawPayload, 2);
    try {
      const current = await fiskalyRequest(config, `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(txId)}`, {
        method: "GET",
      });
      const currentRecord = asRecord(current);
      const currentRevision = pickNumber(currentRecord, ["tx_revision", "revision"]);
      const state = pickString(currentRecord, ["state"]);
      if (state && ["FINISHED", "CANCELLED"].includes(state.toUpperCase())) {
        return;
      }
      if (typeof currentRevision === "number") {
        revision = currentRevision + 1;
      }
    } catch {
      // continue best-effort cancel
    }

    await fiskalyRequest(
      config,
      `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(txId)}?tx_revision=${encodeURIComponent(String(revision))}`,
      {
        method: "PUT",
        body: JSON.stringify(buildCancelPayload(ctx, config)),
        idempotencyKey: `${ctx.txId}:cancel`,
      },
    );
  }
}

export type { ExistingTseState };
