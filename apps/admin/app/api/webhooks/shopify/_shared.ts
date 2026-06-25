import { NextResponse } from "next/server";

import { cacheShopifyFetchedOrders } from "@/lib/shopifyOrderBackfill";
import { fetchShopifyOrderById } from "@/lib/shopifyOrders";
import { extractShopifyWebhookOrderGid, validateShopifyWebhookHmac } from "@/lib/shopifyWebhook";
import { connectMongo } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function handleShopifyOrderWebhook(req: Request, topic: string) {
  const rawBody = await req.text();
  const providedHmac = req.headers.get("x-shopify-hmac-sha256");

  if (!validateShopifyWebhookHmac(rawBody, providedHmac)) {
    return NextResponse.json({ ok: false, error: "invalid_hmac" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderGid = extractShopifyWebhookOrderGid(payload);
  if (!orderGid) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  const order = await fetchShopifyOrderById(orderGid);
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "order_not_found", topic, orderGid }, { status: 200 });
  }

  await connectMongo();
  const result = await cacheShopifyFetchedOrders({ orders: [order] });

  return NextResponse.json({ topic, orderGid, ...result }, { status: 200 });
}
