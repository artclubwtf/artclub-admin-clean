import { randomUUID } from "crypto";

export const SHOPIFY_PULL_SCOPE = "ARTCLUB_SHOPIFY_PULL" as const;
export const SHOPIFY_PUSH_SCOPE = "ARTCLUB_SHOPIFY_PUSH" as const;
export const ARTIST_AUTO_SYNC_SCOPE = "ARTCLUB_ARTIST_AUTO_SYNC" as const;
export const SHOPIFY_SYNC_ERROR_SCOPE = "ARTCLUB_SHOPIFY_SYNC_ERROR" as const;
export const SHOPIFY_DIAGNOSTICS_SCOPE = "ARTCLUB_SHOPIFY_DIAGNOSTICS" as const;
export const ARTIST_PROFILE_RENDER_SCOPE = "ARTCLUB_ARTIST_PROFILE_RENDER" as const;

type SyncScope =
  | typeof SHOPIFY_PULL_SCOPE
  | typeof SHOPIFY_PUSH_SCOPE
  | typeof ARTIST_AUTO_SYNC_SCOPE
  | typeof SHOPIFY_SYNC_ERROR_SCOPE
  | typeof SHOPIFY_DIAGNOSTICS_SCOPE
  | typeof ARTIST_PROFILE_RENDER_SCOPE;

type SyncLogOptions = {
  runId?: string;
  force?: boolean;
  verboseOnly?: boolean;
};

const SENSITIVE_KEY_PATTERN =
  /token|secret|authorization|cookie|password|mongodb_uri|s3_secret_access_key|access[_-]?key|api[_-]?key|shopify_admin_access_token/i;

function envFlagEnabled(name: string): boolean {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isShopifySyncDebugEnabled() {
  return envFlagEnabled("DEBUG_SHOPIFY_SYNC");
}

export function isShopifySyncVerboseEnabled() {
  return isShopifySyncDebugEnabled() && envFlagEnabled("DEBUG_SHOPIFY_SYNC_VERBOSE");
}

export function createSyncRunId(prefix = "shopify-sync") {
  return `${prefix}_${randomUUID()}`;
}

export function previewValue(value: unknown, maxLength = 120): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^data:/i.test(trimmed)) {
    return `[omitted_data_uri length=${trimmed.length}]`;
  }
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...[truncated:${trimmed.length - maxLength}]`;
}

function shouldLog(options?: SyncLogOptions) {
  if (options?.force) return true;
  if (options?.verboseOnly) return isShopifySyncVerboseEnabled();
  return isShopifySyncDebugEnabled();
}

function sanitizeString(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^data:/i.test(trimmed)) return `[omitted_data_uri length=${trimmed.length}]`;
  if (/^Bearer\s+/i.test(trimmed)) return "[redacted_bearer_token]";
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...[truncated:${trimmed.length - maxLength}]`;
}

function sanitizeValue(value: unknown, key?: string, depth = 0): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value, isShopifySyncVerboseEnabled() ? 1000 : 280);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message || "unknown_error", 400),
    };
  }
  if (depth >= 5) return "[depth_limited]";
  if (Array.isArray(value)) {
    const limit = isShopifySyncVerboseEnabled() ? 50 : 20;
    const items = value.slice(0, limit).map((entry) => sanitizeValue(entry, undefined, depth + 1));
    if (value.length > limit) items.push(`[+${value.length - limit} more]`);
    return items;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitized: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of entries) {
      sanitized[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1);
    }
    return sanitized;
  }
  return String(value);
}

function emit(scope: SyncScope, event: string, payload: unknown, options?: SyncLogOptions) {
  if (!shouldLog(options)) return;
  console.log(
    JSON.stringify({
      scope,
      event,
      runId: options?.runId || null,
      timestamp: new Date().toISOString(),
      payload: sanitizeValue(payload),
    }),
  );
}

type ErrorLikeWithDetails = Error & { details?: Record<string, unknown> };

export function extractErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== "object") return undefined;
  const details = (error as ErrorLikeWithDetails).details;
  if (!details || typeof details !== "object") return undefined;
  return sanitizeValue(details) as Record<string, unknown>;
}

export function logShopifyPull(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(SHOPIFY_PULL_SCOPE, event, payload, options);
}

export function logShopifyPush(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(SHOPIFY_PUSH_SCOPE, event, payload, options);
}

export function logArtistImport(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(SHOPIFY_PULL_SCOPE, event, payload, options);
}

export function logProductImport(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(SHOPIFY_PULL_SCOPE, event, payload, options);
}

export function logAutoSync(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(ARTIST_AUTO_SYNC_SCOPE, event, payload, options);
}

export function logShopifyDiagnostics(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(SHOPIFY_DIAGNOSTICS_SCOPE, event, payload, options);
}

export function logArtistProfileRender(event: string, payload: unknown, options?: SyncLogOptions) {
  emit(ARTIST_PROFILE_RENDER_SCOPE, event, payload, options);
}

export function logSyncError(event: string, error: unknown, payload?: unknown, options?: SyncLogOptions) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "unknown_error");
  const shouldIncludeStack = process.env.NODE_ENV !== "production" || envFlagEnabled("DEBUG_SHOPIFY_SYNC_VERBOSE");

  console.error(
    JSON.stringify({
      scope: SHOPIFY_SYNC_ERROR_SCOPE,
      event,
      runId: options?.runId || null,
      timestamp: new Date().toISOString(),
      error: {
        name: err.name,
        message: sanitizeString(err.message || "unknown_error", 500),
        ...(shouldIncludeStack && err.stack ? { stack: sanitizeString(err.stack, 4000) } : {}),
        ...(extractErrorDetails(error) ? { details: extractErrorDetails(error) } : {}),
      },
      payload: sanitizeValue(payload),
    }),
  );
}
