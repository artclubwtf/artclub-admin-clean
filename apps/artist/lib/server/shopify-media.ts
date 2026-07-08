import { resolveShopDomain } from "@/lib/server/shop-domain";

export type ResolvedShopifyMediaImage = { url: string; width?: number; height?: number; altText?: string };
type ResolveOptions = { fetchImpl?: typeof fetch; shopDomain?: string | null; token?: string | null };
const cache = new Map<string, { value: ResolvedShopifyMediaImage; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function isShopifyMediaImageGid(value: string | null | undefined) {
  return /^gid:\/\/shopify\/MediaImage\/\d+$/.test(value?.trim() || "");
}

export function isShopifyCdnImageUrl(value: string | null | undefined) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && url.hostname === "cdn.shopify.com"; }
  catch { return false; }
}

export async function resolveShopifyMediaImageGids(ids: string[], options: ResolveOptions = {}) {
  const unique = Array.from(new Set(ids.map(value => value.trim()).filter(isShopifyMediaImageGid)));
  const lookup: Record<string, ResolvedShopifyMediaImage> = {};
  const now = Date.now();
  const missing: string[] = [];
  for (const id of unique) { const cached = cache.get(id); if (cached && cached.expiresAt > now) lookup[id] = cached.value; else missing.push(id); }
  if (!missing.length) return { lookup, unresolved: [] as string[], error: null as string | null };

  const shopDomain = resolveShopDomain(options.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN);
  const token = options.token || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shopDomain || !token) return { lookup, unresolved: missing, error: "shopify_media_credentials_missing" };
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const query = `query ResolveMedia($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { id image { url width height altText } } } }`;
  try {
    const response = await (options.fetchImpl || fetch)(`https://${shopDomain}/admin/api/${version}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables: { ids: missing } }), cache: "no-store" });
    const json = await response.json() as { data?: { nodes?: Array<{ id?: string; image?: { url?: string; width?: number; height?: number; altText?: string } | null } | null> }; errors?: unknown };
    if (!response.ok || json.errors) return { lookup, unresolved: missing, error: `shopify_media_request_failed_${response.status}` };
    for (const node of json.data?.nodes || []) {
      const id = node?.id?.trim() || ""; const url = node?.image?.url?.trim() || "";
      if (!isShopifyMediaImageGid(id) || !isShopifyCdnImageUrl(url)) continue;
      const value = { url, ...(typeof node?.image?.width === "number" ? { width: node.image.width } : {}), ...(typeof node?.image?.height === "number" ? { height: node.image.height } : {}), ...(node?.image?.altText ? { altText: node.image.altText } : {}) };
      lookup[id] = value; cache.set(id, { value, expiresAt: now + CACHE_TTL_MS });
    }
    return { lookup, unresolved: missing.filter(id => !lookup[id]), error: null as string | null };
  } catch {
    return { lookup, unresolved: missing, error: "shopify_media_request_unavailable" };
  }
}
