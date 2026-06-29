const PUBLIC_CORS_PROD_ORIGIN = "https://artclub.wtf";
const PUBLIC_CORS_ALLOWED_ORIGINS = new Set([PUBLIC_CORS_PROD_ORIGIN, "https://www.artclub.wtf"]);

function isAllowedPreviewHostname(hostname: string) {
  return hostname.endsWith(".myshopify.com") || hostname.endsWith(".shopifypreview.com");
}

export function resolvePublicCorsOrigin(origin: string | null | undefined) {
  const raw = (origin || "").trim();
  if (!raw) return PUBLIC_CORS_PROD_ORIGIN;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return PUBLIC_CORS_PROD_ORIGIN;
    if (PUBLIC_CORS_ALLOWED_ORIGINS.has(url.origin)) return url.origin;
    if (isAllowedPreviewHostname(url.hostname)) return url.origin;
  } catch {
    return PUBLIC_CORS_PROD_ORIGIN;
  }

  return PUBLIC_CORS_PROD_ORIGIN;
}

export function buildPublicCorsHeaders(origin: string | null | undefined) {
  return {
    "Access-Control-Allow-Origin": resolvePublicCorsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}
