import { createHmac, timingSafeEqual } from "crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateShopifyWebhookHmac(rawBody: string, providedHmac: string | null) {
  const secret = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
  if (!secret || !providedHmac) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return safeEqual(expected, providedHmac.trim());
}

function toOrderGidFromNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `gid://shopify/Order/${Math.trunc(value)}`;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return `gid://shopify/Order/${value.trim()}`;
  return null;
}

export function extractShopifyWebhookOrderGid(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.admin_graphql_api_id,
    payload.order_admin_graphql_api_id,
    payload.orderAdminGraphqlApiId,
    payload.order_id,
    payload.orderId,
    payload.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("gid://shopify/Order/")) return candidate.trim();
    const numeric = toOrderGidFromNumeric(candidate);
    if (numeric) return numeric;
  }

  const order = payload.order;
  if (order && typeof order === "object") {
    const nested: string | null = extractShopifyWebhookOrderGid(order as Record<string, unknown>);
    if (nested) return nested;
  }

  return null;
}
