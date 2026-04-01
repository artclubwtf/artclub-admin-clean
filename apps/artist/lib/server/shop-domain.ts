export function normalizeShopDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function resolveShopDomain(input?: string | null): string | null {
  const raw = input?.toString().trim() || process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN;
  if (!raw) return null;
  return normalizeShopDomain(raw);
}
