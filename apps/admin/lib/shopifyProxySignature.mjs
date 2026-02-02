import { createHmac, timingSafeEqual } from "crypto";

export function buildShopifyProxySignatureMessage(params) {
  const grouped = new Map();
  for (const [key, value] of params.entries()) {
    if (key === "signature" || key === "hmac") continue;
    const values = grouped.get(key);
    if (values) {
      values.push(value);
    } else {
      grouped.set(key, [value]);
    }
  }

  const pairs = Array.from(grouped.entries(), ([key, values]) => `${key}=${values.join(",")}`);
  pairs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs.join("");
}

export function getShopifyProxyProvidedSignature(params) {
  return params.get("signature") || params.get("hmac");
}

export function compareShopifyProxySignatures(expected, provided) {
  const left = expected.toLowerCase();
  const right = provided.toLowerCase();
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function computeShopifyProxySignatureFromMessage(message, secret) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function computeShopifyProxySignature(params, secret) {
  const message = buildShopifyProxySignatureMessage(params);
  return computeShopifyProxySignatureFromMessage(message, secret);
}

export function verifyShopifyProxySignature(params, secret) {
  const signature = getShopifyProxyProvidedSignature(params);
  if (!signature) return false;
  const digest = computeShopifyProxySignature(params, secret);
  return compareShopifyProxySignatures(digest, signature);
}
