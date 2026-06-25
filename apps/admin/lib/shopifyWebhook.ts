import { createHmac, timingSafeEqual } from "crypto";

export type ShopifyWebhookHmacValidation = {
  webhookSecretPresent: boolean;
  hmacHeaderPresent: boolean;
  rawBodyLength: number;
  hmacValid: boolean;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function toRawBodyBuffer(rawBody: string | Buffer) {
  return Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
}

export function getShopifyWebhookHmacValidation(rawBody: string | Buffer, providedHmac: string | null): ShopifyWebhookHmacValidation {
  const secret = (process.env.SHOPIFY_WEBHOOK_SECRET || "").trim();
  const normalizedHmac = providedHmac?.trim() || "";
  const webhookSecretPresent = Boolean(secret);
  const hmacHeaderPresent = Boolean(normalizedHmac);
  const rawBodyBuffer = toRawBodyBuffer(rawBody);
  const rawBodyLength = rawBodyBuffer.byteLength;

  if (!webhookSecretPresent || !hmacHeaderPresent) {
    return {
      webhookSecretPresent,
      hmacHeaderPresent,
      rawBodyLength,
      hmacValid: false,
    };
  }

  const expected = createHmac("sha256", secret).update(rawBodyBuffer).digest("base64");
  return {
    webhookSecretPresent,
    hmacHeaderPresent,
    rawBodyLength,
    hmacValid: safeEqual(expected, normalizedHmac),
  };
}

export function validateShopifyWebhookHmac(rawBody: string | Buffer, providedHmac: string | null) {
  return getShopifyWebhookHmacValidation(rawBody, providedHmac).hmacValid;
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
