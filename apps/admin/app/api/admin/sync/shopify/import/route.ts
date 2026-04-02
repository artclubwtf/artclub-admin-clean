import { NextResponse } from "next/server";
import { z } from "zod";

import { isMigrationModeEnabled } from "@/lib/featureFlags";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
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
        ? await importArtistsReadOnly({ shopDomain: params.shopDomain, limit: params.limit, cursor })
        : await importProductsReadOnly({ shopDomain: params.shopDomain, limit: params.limit, cursor });

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
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing Shopify shop domain" }, { status: 500 });
  }

  await connectMongo();

  try {
    const scopes = parsed.data.scope === "all" ? (["artists", "products"] as const) : [parsed.data.scope];
    const results = [] as Array<{ scope: "artists" | "products"; importedCount: number; cursor: string | null }>;

    for (const scope of scopes) {
      results.push(
        await runImport({
          scope,
          limit: parsed.data.limit,
          full: Boolean(parsed.data.full),
          shopDomain,
        }),
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode: "read_only_import",
        shopDomain,
        durationMs: Date.now() - startedAt,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "shopify_import_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
