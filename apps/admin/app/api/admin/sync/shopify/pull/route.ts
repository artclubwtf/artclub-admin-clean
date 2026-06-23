import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { isMigrationModeEnabled } from "@/lib/featureFlags";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { createSyncRunId, logShopifyPull, logSyncError } from "@/lib/sync/syncLogger";
import { pullArtists, pullProducts } from "@/lib/sync/shopifyPull";
import { SyncStateModel } from "@/models/SyncState";

const payloadSchema = z.object({
  scope: z.enum(["artists", "products"]),
  limit: z.number().int().min(1).max(250).optional(),
  full: z.boolean().optional(),
});

function mapScope(scope: "artists" | "products"): "shopify_pull_artists" | "shopify_pull_products" {
  return scope === "artists" ? "shopify_pull_artists" : "shopify_pull_products";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const entryRunId = createSyncRunId("shopify-pull-route");
  logShopifyPull(
    "admin_shopify_pull_route_hit",
    {
      runId: entryRunId,
      service: "admin",
      method: req.method,
      timestamp: new Date().toISOString(),
      hasAdminSession: Boolean(session?.user && (session.user.role === "admin" || session.user.role === "team")),
      DEBUG_SHOPIFY_SYNC: (process.env.DEBUG_SHOPIFY_SYNC || "").trim() || null,
      DEBUG_SHOPIFY_SYNC_VERBOSE: (process.env.DEBUG_SHOPIFY_SYNC_VERBOSE || "").trim() || null,
    },
    { runId: entryRunId, force: true },
  );

  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const sessionUser = session;

  if (!isMigrationModeEnabled()) {
    return NextResponse.json({ ok: false, error: "migration_mode_disabled" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const startedAt = Date.now();
  const scope = parsed.data.scope;
  const limit = parsed.data.limit;
  const full = Boolean(parsed.data.full);
  const syncScope = mapScope(scope);
  const shopDomain = resolveShopDomain();
  const runId = createSyncRunId("shopify-pull");

  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing Shopify shop domain" }, { status: 500 });
  }

  await connectMongo();

  const updateStateOnError = async (message: string) => {
    await SyncStateModel.findOneAndUpdate(
      { shopDomain, scope: syncScope },
      {
        $set: {
          lastRunAt: new Date(),
          lastError: message,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  };

  try {
    logShopifyPull(
      "admin_shopify_pull_started",
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        role: sessionUser?.user?.role || null,
        runId,
        scope,
        shopDomain,
        full,
        limit: limit || null,
      },
      { runId, force: true },
    );

    const existing = await SyncStateModel.findOne({ shopDomain, scope: syncScope })
      .select({ cursor: 1 })
      .lean();

    let cursor: string | null | undefined = full ? null : existing?.cursor || null;
    let importedCount = 0;

    do {
      const result: { importedCount: number; cursor: string | null } =
        scope === "artists"
          ? await pullArtists({ shopDomain, limit, cursor, runId })
          : await pullProducts({ shopDomain, limit, cursor, runId });

      importedCount += result.importedCount;
      cursor = result.cursor;
    } while (full && cursor);

    const finalCursor = cursor || null;
    await SyncStateModel.findOneAndUpdate(
      { shopDomain, scope: syncScope },
      {
        $set: {
          cursor: finalCursor,
          lastRunAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    logShopifyPull(
      "admin_shopify_pull_finished",
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        role: sessionUser?.user?.role || null,
        scope,
        runId,
        artistsCount: scope === "artists" ? importedCount : 0,
        productsCount: scope === "products" ? importedCount : 0,
        errorsCount: 0,
        cursor: finalCursor,
        durationMs: Date.now() - startedAt,
      },
      { runId, force: true },
    );

    return NextResponse.json(
      {
        ok: true,
        scope,
        importedCount,
        cursor: finalCursor,
        durationMs: Date.now() - startedAt,
        runId,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pull from Shopify";
    await updateStateOnError(message);
    logSyncError(
      "admin_shopify_pull_failed",
      error,
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        role: sessionUser?.user?.role || null,
        scope,
        shopDomain,
        message,
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: message, runId }, { status: 500 });
  }
}
