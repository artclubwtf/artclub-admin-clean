import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { isShopifyWriteEnabled } from "@/lib/featureFlags";
import { requireAdmin } from "@/lib/requireAdmin";
import { getArtistShopifySyncMode } from "@/lib/artistShopifySyncMode";
import { resolveShopDomain } from "@/lib/shopDomain";
import { createSyncRunId, logShopifyPush, logSyncError } from "@/lib/sync/syncLogger";
import { pushArtists, pushProducts } from "@/lib/sync/shopifyPush";
import { queueInventorySyncJob } from "@/lib/sync/shopifySyncJobs";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { SyncStateModel } from "@/models/SyncState";

const payloadSchema = z.object({
  scope: z.enum(["artists", "products"]),
  limit: z.number().int().min(1).max(250).optional(),
  artistKeys: z.array(z.string().trim().min(1)).optional(),
  productKeys: z.array(z.string().trim().min(1)).optional(),
  dryRun: z.boolean().optional(),
  approvedOnly: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  if (!isShopifyWriteEnabled()) {
    const runId = createSyncRunId("shopify-push");
    logShopifyPush(
      "shopify_write_disabled_diagnostics",
      {
        service: "admin",
        SHOPIFY_WRITE_ENABLED: (process.env.SHOPIFY_WRITE_ENABLED || "").trim() || null,
        hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
        hasShopifyShopDomain: Boolean(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN),
        attemptedOperation: "admin_push_route",
        canonicalProductId: null,
        productKey: null,
        requiredFix: "Set SHOPIFY_WRITE_ENABLED=true on this service",
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: "shopify_write_disabled" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const scope = parsed.data.scope;
  const limit = parsed.data.limit;
  const startedAt = Date.now();
  const shopDomain = resolveShopDomain();
  const runId = createSyncRunId("shopify-push");
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing Shopify shop domain" }, { status: 500 });
  }

  await connectMongo();

  try {
    logShopifyPush(
      "admin_shopify_push_started",
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        role: session?.user?.role || null,
        scope,
        shopDomain,
        dryRun: Boolean(parsed.data.dryRun),
        approvedOnly: Boolean(parsed.data.approvedOnly),
        limit: limit || null,
        artistKeysCount: parsed.data.artistKeys?.length || 0,
        productKeysCount: parsed.data.productKeys?.length || 0,
      },
      { runId, force: true },
    );

    const result =
      scope === "artists"
        ? await pushArtists({
            shopDomain,
            limit,
            artistKeys: parsed.data.artistKeys,
            dryRun: parsed.data.dryRun,
            runId,
          })
        : await pushProducts({
            shopDomain,
            limit,
            productKeys: parsed.data.productKeys,
            dryRun: parsed.data.dryRun,
            approvedOnly: parsed.data.approvedOnly,
            runId,
          });
    const artistSyncMode = scope === "artists" ? getArtistShopifySyncMode() : undefined;

    if (scope === "products" && !parsed.data.dryRun) {
      const successfulProductKeys = result.items
        .filter((item) => item.status === "created" || item.status === "updated")
        .map((item) => item.key);

      if (successfulProductKeys.length) {
        const products = await CanonicalProductModel.find({
          shopDomain,
          productKey: { $in: successfulProductKeys },
        })
          .select({ _id: 1, productKey: 1 })
          .lean();

        for (const product of products) {
          await queueInventorySyncJob({
            canonicalProductId: String(product._id),
            shopDomain,
            productKey: product.productKey,
            reason: "admin_product_push_followup",
          });
        }
      }
    }

    await SyncStateModel.findOneAndUpdate(
      { shopDomain, scope: "shopify_push" },
      {
        $set: {
          lastRunAt: new Date(),
          lastSuccessAt: new Date(),
          lastError:
            result.failedCount > 0
              ? `${scope === "artists" ? `[artist_mode=${artistSyncMode}] ` : ""}${result.errors.slice(0, 5).join(" | ")}`
              : null,
          cursor: null,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    logShopifyPush(
      "admin_shopify_push_finished",
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        scope,
        runId,
        pushedCount: result.pushedCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        durationMs: Date.now() - startedAt,
      },
      { runId, force: true },
    );

    return NextResponse.json(
      {
        ok: true,
        scope,
        pushedCount: result.pushedCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        durationMs: Date.now() - startedAt,
        errors: result.errors,
        items: result.items,
        dryRun: Boolean(parsed.data.dryRun),
        runId,
        ...(artistSyncMode ? { artistSyncMode } : {}),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to push to Shopify";
    await SyncStateModel.findOneAndUpdate(
      { shopDomain, scope: "shopify_push" },
      {
        $set: {
          lastRunAt: new Date(),
          lastError: message,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    logSyncError(
      "admin_shopify_push_failed",
      error,
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        scope,
        shopDomain,
        message,
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: message, runId }, { status: 500 });
  }
}
