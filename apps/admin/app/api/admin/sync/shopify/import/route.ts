import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { isMigrationModeEnabled } from "@/lib/featureFlags";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { createSyncRunId, logShopifyPull, logSyncError } from "@/lib/sync/syncLogger";
import { importArtistsReadOnly, importProductsReadOnly } from "@/lib/sync/shopifyPull";
import { SyncStateModel } from "@/models/SyncState";

const payloadSchema = z.object({
  scope: z.enum(["artists", "products", "all"]),
  limit: z.number().int().min(1).max(250).optional(),
  full: z.boolean().optional(),
});

function mapScope(scope: "artists" | "products"): "shopify_import_artists" | "shopify_import_products" {
  return scope === "artists" ? "shopify_import_artists" : "shopify_import_products";
}

async function runImport(params: {
  scope: "artists" | "products";
  limit?: number;
  full: boolean;
  shopDomain: string;
  runId: string;
}) {
  const syncScope = mapScope(params.scope);
  const existing = await SyncStateModel.findOne({ shopDomain: params.shopDomain, scope: syncScope })
    .select({ cursor: 1 })
    .lean();

  let cursor: string | null | undefined = params.full ? null : existing?.cursor || null;
  let importedCount = 0;

  do {
    const result: { importedCount: number; cursor: string | null } =
      params.scope === "artists"
        ? await importArtistsReadOnly({ shopDomain: params.shopDomain, limit: params.limit, cursor, runId: params.runId })
        : await importProductsReadOnly({ shopDomain: params.shopDomain, limit: params.limit, cursor, runId: params.runId });

    importedCount += result.importedCount;
    cursor = result.cursor;
  } while (params.full && cursor);

  const finalCursor = cursor || null;
  await SyncStateModel.findOneAndUpdate(
    { shopDomain: params.shopDomain, scope: syncScope },
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

  return {
    scope: params.scope,
    importedCount,
    cursor: finalCursor,
  };
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const session = await getServerSession(authOptions);

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
  const shopDomain = resolveShopDomain();
  const runId = createSyncRunId("shopify-import");
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing Shopify shop domain" }, { status: 500 });
  }

  await connectMongo();

  try {
    logShopifyPull(
      "admin_shopify_reimport_started",
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        role: session?.user?.role || null,
        requestedScope: parsed.data.scope,
        shopDomain,
        full: Boolean(parsed.data.full),
        limit: parsed.data.limit || null,
      },
      { runId, force: true },
    );

    const scopes = parsed.data.scope === "all" ? (["artists", "products"] as const) : [parsed.data.scope];
    const results = [] as Array<{ scope: "artists" | "products"; importedCount: number; cursor: string | null }>;

    for (const scope of scopes) {
      results.push(
        await runImport({
          scope,
          limit: parsed.data.limit,
          full: Boolean(parsed.data.full),
          shopDomain,
          runId,
        }),
      );
    }

    logShopifyPull(
      "admin_shopify_reimport_finished",
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        runId,
        artistsCount: results.find((item) => item.scope === "artists")?.importedCount || 0,
        productsCount: results.find((item) => item.scope === "products")?.importedCount || 0,
        errorsCount: 0,
        durationMs: Date.now() - startedAt,
      },
      { runId, force: true },
    );

    return NextResponse.json(
      {
        ok: true,
        mode: "read_only_import",
        shopDomain,
        durationMs: Date.now() - startedAt,
        runId,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "shopify_import_failed";
    logSyncError(
      "admin_shopify_reimport_failed",
      error,
      {
        triggeredBy: session?.user?.email || session?.user?.id || "unknown",
        shopDomain,
        message,
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: message, runId }, { status: 500 });
  }
}
