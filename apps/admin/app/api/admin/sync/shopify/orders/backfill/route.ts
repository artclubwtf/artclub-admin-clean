import { NextResponse } from "next/server";
import { z } from "zod";

import { backfillShopifyOrders } from "@/lib/shopifyOrderBackfill";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { createSyncRunId, logSyncError } from "@/lib/sync/syncLogger";

const payloadSchema = z.object({
  limitPerPage: z.number().int().min(1).max(100).optional(),
  maxPages: z.number().int().min(1).max(100).optional(),
  since: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const runId = createSyncRunId("shopify-orders-backfill");

  await connectMongo();

  try {
    const result = await backfillShopifyOrders({
      ...parsed.data,
      runId,
    });

    return NextResponse.json({ ...result, runId }, { status: 200 });
  } catch (error) {
    logSyncError("shopify_orders_backfill_failed", error, {}, { runId, force: true });
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "shopify_orders_backfill_failed",
        runId,
      },
      { status: 500 },
    );
  }
}
