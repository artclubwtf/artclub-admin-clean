import { createHmac, timingSafeEqual } from "crypto";

function buildProxySignatureMessage(params) {
  const grouped = new Map();
  for (const [key, value] of params.entries()) {
    if (key === "signature") continue;
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

function signaturesMatch(expected, provided) {
  const left = expected.toLowerCase();
  const right = provided.toLowerCase();
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function computeShopifyProxySignature(params, secret) {
  const message = buildProxySignatureMessage(params);
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function verifyShopifyProxySignature(params, secret) {
  const signature = params.get("signature");
  if (!signature) return false;
  const digest = computeShopifyProxySignature(params, secret);
  return signaturesMatch(digest, signature);
}
