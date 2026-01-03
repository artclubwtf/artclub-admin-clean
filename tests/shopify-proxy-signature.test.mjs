import assert from "node:assert/strict";
import test from "node:test";

import { computeShopifyProxySignature, verifyShopifyProxySignature } from "../lib/shopifyProxySignature.mjs";

test("shopify proxy signature sample (secret hush)", () => {
  const query =
    "extra=1&extra=2&shop=some-shop.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=5e2178f38200aed046f7944c03c410698b34595edb3968b0e3ab8d4db12f142f";
  const params = new URLSearchParams(query);
  const expected = params.get("signature");
  assert.ok(expected);

  const signature = computeShopifyProxySignature(params, "hush");
  assert.equal(signature, expected);
  assert.equal(verifyShopifyProxySignature(params, "hush"), true);
});
