type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "unknown";
}

export function rateLimit(
  key: string,
  {
    limit = 5,
    windowMs = 60_000,
  }: {
    limit?: number;
    windowMs?: number;
  } = {},
) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const next: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return {
      ok: true,
      remaining: limit - 1,
      resetAt: next.resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const ok = existing.count <= limit;
  const remaining = Math.max(0, limit - existing.count);
  const retryAfterSeconds = ok ? 0 : Math.ceil((existing.resetAt - now) / 1000);
  return { ok, remaining, resetAt: existing.resetAt, retryAfterSeconds };
}
