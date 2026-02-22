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

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function deterministicUuid(input: string, namespace = "artclub-fiskaly-tx") {
  const hash = createHash("sha256").update(`${namespace}:${input}`).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  // RFC 4122 variant + version 4 style bits (deterministic payload, not random)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getFiskalyBaseUrl(env: "sandbox" | "production", override?: string | null) {
  const raw = trimOptional(override);
  if (raw) {
    const normalized = raw.replace(/\/+$/, "");
    return normalized.endsWith("/api/v2") ? normalized : `${normalized}/api/v2`;
  }

  // SIGN DE V2 docs document the middleware host without an explicit sandbox suffix.
  // TEST/LIVE is selected by the API key/secret environment, not by a different hostname.
  void env;
  return "https://kassensichv-middleware.fiskaly.com/api/v2";
}

function getFiskalyBackendApiBaseUrl(env: "sandbox" | "production") {
  void env;
  return "https://kassensichv.fiskaly.com/api/v2";
}

function toServiceRootUrl(apiBaseUrl: string) {
  return apiBaseUrl.replace(/\/api\/v2\/?$/i, "");
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
  if (!isUuidLike(clientId)) {
    throw new Error("fiskaly_not_configured:invalid_client_id_uuid");
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
  const normalizedMessage = message.replace(/\s+/g, " ").trim();

  const cause =
    error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  if (!cause || typeof cause !== "object") {
    return normalizedMessage;
  }

  const causeRecord = cause as Record<string, unknown>;
  const details = [
    typeof causeRecord.name === "string" ? `cause=${causeRecord.name}` : null,
    typeof causeRecord.code === "string" ? `code=${causeRecord.code}` : null,
    typeof causeRecord.errno === "number" || typeof causeRecord.errno === "string" ? `errno=${String(causeRecord.errno)}` : null,
    typeof causeRecord.syscall === "string" ? `syscall=${causeRecord.syscall}` : null,
    typeof causeRecord.hostname === "string" ? `hostname=${causeRecord.hostname}` : null,
    typeof causeRecord.address === "string" ? `address=${causeRecord.address}` : null,
    typeof causeRecord.port === "number" || typeof causeRecord.port === "string" ? `port=${String(causeRecord.port)}` : null,
    typeof causeRecord.message === "string" ? `causeMessage=${causeRecord.message.replace(/\s+/g, " ").trim()}` : null,
  ].filter(Boolean);

  return details.length > 0 ? `${normalizedMessage} [${details.join(", ")}]` : normalizedMessage;
}

async function getAuthToken(config: FiskalyConfig) {
  const cacheKey = createHash("sha256").update(`${config.baseUrl}|${config.apiKey}|${config.apiSecret}`).digest("hex");
  const now = Date.now();
  if (authTokenCache && authTokenCache.cacheKey === cacheKey && authTokenCache.expiresAt - 15_000 > now) {
    return authTokenCache.token;
  }

  const authPayload = {
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    base_url: toServiceRootUrl(config.baseUrl),
  };

  const tryAuth = async (apiBaseUrl: string, tag: "middleware" | "backend") => {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authPayload),
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(`fiskaly_network_error:auth:${apiBaseUrl}/auth:${describeFetchError(error)}`);
    }

    const payload = await readJsonSafe(response);
    return { response, payload, tag, apiBaseUrl };
  };

  let authAttempt = await tryAuth(config.baseUrl, "middleware");

  // SIGN DE V2 docs note that auth is still available via backend; some middleware hosts return 404 for /auth.
  if (authAttempt.response.status === 404) {
    authAttempt = await tryAuth(getFiskalyBackendApiBaseUrl(config.env), "backend");
  }

  if (!authAttempt.response.ok) {
    const hint =
      authAttempt.response.status === 404
        ? ":hint=check_fiskaly_base_url_or_host(use_sign_de_v2_middleware_and_backend_auth_fallback)"
        : "";
    throw new Error(
      `fiskaly_auth_failed:${authAttempt.response.status}:${summarizeErrorPayload(authAttempt.payload)}:auth_via=${authAttempt.tag}:${authAttempt.apiBaseUrl}${hint}`,
    );
  }

  const json = authAttempt.payload;
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

function buildTxUpsertPath(config: FiskalyConfig) {
  return `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(config.clientId)}`;
}

function buildTxRetrievePath(config: FiskalyConfig, fiskalyTxId: string) {
  return `/tss/${encodeURIComponent(config.tssId)}/tx/${encodeURIComponent(config.clientId)}/${encodeURIComponent(fiskalyTxId)}`;
}

function buildStandardV1SchemaPayload(
  type: string,
  data: string,
  receiptType: "RECEIPT" | "ORDER" = "RECEIPT",
) {
  return {
    standard_v1: {
      receipt: {
        receipt_type: receiptType,
        type,
        data,
      },
    },
  };
}

function buildReceiptDataString(ctx: FiskalyTSETransactionContext, mode: "ACTIVE" | "FINISHED" | "CANCELLED") {
  const gross = Math.max(0, ctx.amountCents);
  const major = gross / 100;
  return JSON.stringify({
    txId: ctx.txId,
    amount: Number(major.toFixed(2)),
    currency: ctx.currency || "EUR",
    status: mode,
  });
}

function buildAmountsPerVatRate(ctx: FiskalyTSETransactionContext) {
  const gross = Math.max(0, ctx.amountCents);
  const major = Number((gross / 100).toFixed(2));
  return [
    {
      vat_rate: "NORMAL",
      amount: major,
    },
  ];
}

function buildStartPayload(ctx: FiskalyTSETransactionContext, config: FiskalyConfig, fiskalyTxId: string) {
  return {
    tx_id: fiskalyTxId,
    state: "ACTIVE",
    client_id: config.clientId,
    // DSFinV-K v2.1: type and data must be empty at start.
    schema: buildStandardV1SchemaPayload("", ""),
    amounts_per_vat_rate: buildAmountsPerVatRate(ctx),
  };
}

function buildFinishPayload(ctx: FiskalyTSETransactionContext, config: FiskalyConfig, fiskalyTxId: string) {
  return {
    tx_id: fiskalyTxId,
    state: "FINISHED",
    client_id: config.clientId,
    schema: buildStandardV1SchemaPayload("Kassenbeleg-V1", buildReceiptDataString(ctx, "FINISHED")),
    amounts_per_vat_rate: buildAmountsPerVatRate(ctx),
  };
}

function buildCancelPayload(ctx: FiskalyTSETransactionContext, config: FiskalyConfig, fiskalyTxId: string) {
  return {
    tx_id: fiskalyTxId,
    state: "CANCELLED",
    client_id: config.clientId,
    schema: buildStandardV1SchemaPayload("Kassenbeleg-V1", buildReceiptDataString(ctx, "CANCELLED")),
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
  const signatureRecord = asRecord(record.signature);
  const logRecord = asRecord(record.log);
  const signature =
    pickString(signatureRecord, ["value", "signature"]) ?? pickString(record, ["signature", "signature_base64", "tse_signature"]);
  if (!signature) {
    throw new Error("fiskaly_finish_failed:missing_signature");
  }
  const signatureCounter =
    pickNumber(record, ["signature_counter", "signatureCounter", "log_message_serial_number"]) ??
    pickNumber(logRecord, ["signature_counter", "message_serial_number", "log_message_serial_number"]) ??
    0;
  const logTime =
    parseDate(record.time_end) ||
    parseDate(record.time_finish) ||
    parseDate(record.log_time) ||
    parseDate(logRecord.timestamp) ||
    parseDate(logRecord.time) ||
    new Date();
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
    return {
      ok: true as const,
      provider: "fiskaly" as const,
      env: config.env,
      baseUrl: config.baseUrl,
      debug: {
        authFallbackEnabled: true,
        backendAuthBaseUrl: getFiskalyBackendApiBaseUrl(config.env),
      },
    };
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
    const txId = ctx.tseTxId || deterministicUuid(ctx.txId);
    const json = await fiskalyRequest(
      config,
      `${buildTxUpsertPath(config)}?tx_revision=1`,
      {
        method: "PUT",
        body: JSON.stringify(buildStartPayload(ctx, config, txId)),
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
    const txId = ctx.tseTxId || ctx.existingTse?.txId || deterministicUuid(ctx.txId);
    let revision = nextRevisionFromRaw(ctx.existingTse?.rawPayload, 2);

    // Try to fetch current transaction state if revision is unknown or stale.
    try {
      const current = await fiskalyRequest(config, buildTxRetrievePath(config, txId), {
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
      `${buildTxUpsertPath(config)}?tx_revision=${encodeURIComponent(String(revision))}`,
      {
        method: "PUT",
        body: JSON.stringify(buildFinishPayload(ctx, config, txId)),
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
    const txId = ctx.tseTxId || ctx.existingTse?.txId || deterministicUuid(ctx.txId);
    let revision = nextRevisionFromRaw(ctx.existingTse?.rawPayload, 2);
    try {
      const current = await fiskalyRequest(config, buildTxRetrievePath(config, txId), {
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
      `${buildTxUpsertPath(config)}?tx_revision=${encodeURIComponent(String(revision))}`,
      {
        method: "PUT",
        body: JSON.stringify(buildCancelPayload(ctx, config, txId)),
        idempotencyKey: `${ctx.txId}:cancel`,
      },
    );
  }
}

export type { ExistingTseState };
