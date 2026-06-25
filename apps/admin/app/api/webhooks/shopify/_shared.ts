import { NextResponse } from "next/server";

import { cacheShopifyFetchedOrders } from "@/lib/shopifyOrderBackfill";
import { fetchShopifyOrderById } from "@/lib/shopifyOrders";
import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { createSyncRunId, logShopifyPull, logSyncError } from "@/lib/sync/syncLogger";
import { extractShopifyWebhookOrderGid, getShopifyWebhookHmacValidation } from "@/lib/shopifyWebhook";
import { SyncStateModel } from "@/models/SyncState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractOrderName(payload: Record<string, unknown>) {
  const candidates = [payload.name, payload.order_name];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const order = payload.order;
  if (order && typeof order === "object") {
    return extractOrderName(order as Record<string, unknown>);
  }

  return null;
}

async function updateWebhookSyncState(params: { lastError: string | null }) {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) return;

  await connectMongo();
  await SyncStateModel.findOneAndUpdate(
    { shopDomain, scope: "shopify_orders_webhook" },
    {
      $set: {
        lastRunAt: new Date(),
        lastSuccessAt: params.lastError ? undefined : new Date(),
        lastError: params.lastError,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

export async function handleShopifyOrderWebhook(req: Request, topic: string) {
  const runId = createSyncRunId(`shopify-orders-webhook-${topic.replace(/[^\w-]+/g, "-")}`);
  const rawBodyBuffer = Buffer.from(await req.arrayBuffer());
  const rawBody = rawBodyBuffer.toString("utf8");
  const providedHmac = req.headers.get("x-shopify-hmac-sha256");
  const hmacValidation = getShopifyWebhookHmacValidation(rawBodyBuffer, providedHmac);
  const webhookLogBase = {
    topic,
    webhook_secret_present: hmacValidation.webhookSecretPresent,
    hmac_header_present: hmacValidation.hmacHeaderPresent,
    raw_body_length: hmacValidation.rawBodyLength,
    hmac_valid: hmacValidation.hmacValid,
  };

  logShopifyPull(
    "route_hit",
    {
      ...webhookLogBase,
      path: new URL(req.url).pathname,
      shopifyOrderId: null,
      orderName: null,
      fetchedFromShopify: false,
      cached: false,
      matchedLineItems: 0,
      unmatchedLineItems: 0,
    },
    { runId, force: true },
  );
  logShopifyPull(
    "shopify_order_webhook_received",
    {
      ...webhookLogBase,
      shopifyOrderId: null,
      orderName: null,
      fetchedFromShopify: false,
      cached: false,
      matchedLineItems: 0,
      unmatchedLineItems: 0,
    },
    { runId, force: true },
  );

  if (!hmacValidation.hmacValid) {
    logShopifyPull(
      "hmac_invalid",
      {
        ...webhookLogBase,
        shopifyOrderId: null,
        orderName: null,
        fetchedFromShopify: false,
        cached: false,
        matchedLineItems: 0,
        unmatchedLineItems: 0,
      },
      { runId, force: true },
    );

    try {
      await updateWebhookSyncState({ lastError: "invalid_hmac" });
    } catch (error) {
      logSyncError("shopify_orders_webhook_state_update_failed", error, { topic, stage: "invalid_hmac" }, { runId, force: true });
    }
    return NextResponse.json({ ok: false, error: "invalid_hmac" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    try {
      await updateWebhookSyncState({ lastError: "invalid_json" });
    } catch (error) {
      logSyncError("shopify_orders_webhook_state_update_failed", error, { topic, stage: "invalid_json" }, { runId, force: true });
    }
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderGid = extractShopifyWebhookOrderGid(payload);
  const orderName = extractOrderName(payload);

  logShopifyPull(
    "hmac_valid",
    {
      ...webhookLogBase,
      shopifyOrderId: orderGid,
      orderName,
      fetchedFromShopify: false,
      cached: false,
      matchedLineItems: 0,
      unmatchedLineItems: 0,
    },
    { runId, force: true },
  );
  logShopifyPull(
    "shopify_order_webhook_hmac_valid",
    {
      ...webhookLogBase,
      shopifyOrderId: orderGid,
      orderName,
      fetchedFromShopify: false,
      cached: false,
      matchedLineItems: 0,
      unmatchedLineItems: 0,
    },
    { runId, force: true },
  );

  if (!orderGid) {
    try {
      await updateWebhookSyncState({ lastError: "missing_order_id" });
    } catch (error) {
      logSyncError("shopify_orders_webhook_state_update_failed", error, { topic, stage: "missing_order_id" }, { runId, force: true });
    }
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }

  try {
    const order = await fetchShopifyOrderById(orderGid);
    if (!order) {
      logShopifyPull(
        "shopify_order_webhook_processed",
        {
          topic,
          shopifyOrderId: orderGid,
          orderName,
          fetchedFromShopify: false,
          cached: false,
          matchedLineItems: 0,
          unmatchedLineItems: 0,
        },
        { runId, force: true },
      );
      await updateWebhookSyncState({ lastError: "order_not_found" });
      return NextResponse.json({ ok: true, ignored: "order_not_found", topic, orderGid }, { status: 200 });
    }

    await connectMongo();
    const result = await cacheShopifyFetchedOrders({ orders: [order], runId });

    logShopifyPull(
      "shopify_order_cached",
      {
        topic,
        shopifyOrderId: order.id,
        orderName: order.name || orderName,
        fetchedFromShopify: true,
        cached: result.importedOrdersCount > 0,
        matchedLineItems: result.matchedLineItemsCount,
        unmatchedLineItems: result.unmatchedLineItemsCount,
      },
      { runId, force: true },
    );
    logShopifyPull(
      "shopify_order_line_items_matched",
      {
        topic,
        shopifyOrderId: order.id,
        orderName: order.name || orderName,
        fetchedFromShopify: true,
        cached: result.importedOrdersCount > 0,
        matchedLineItems: result.matchedLineItemsCount,
        unmatchedLineItems: result.unmatchedLineItemsCount,
      },
      { runId, force: true },
    );
    logShopifyPull(
      "shopify_order_webhook_processed",
      {
        topic,
        shopifyOrderId: order.id,
        orderName: order.name || orderName,
        fetchedFromShopify: true,
        cached: result.importedOrdersCount > 0,
        matchedLineItems: result.matchedLineItemsCount,
        unmatchedLineItems: result.unmatchedLineItemsCount,
      },
      { runId, force: true },
    );

    await updateWebhookSyncState({ lastError: null });
    return NextResponse.json({ topic, orderGid, ...result }, { status: 200 });
  } catch (error) {
    logSyncError("shopify_orders_webhook_failed", error, { topic, orderGid, orderName }, { runId, force: true });
    try {
      await updateWebhookSyncState({
        lastError: error instanceof Error ? error.message : "shopify_orders_webhook_failed",
      });
    } catch (stateError) {
      logSyncError(
        "shopify_orders_webhook_state_update_failed",
        stateError,
        { topic, stage: "exception" },
        { runId, force: true },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "shopify_orders_webhook_failed" },
      { status: 500 },
    );
  }
}
