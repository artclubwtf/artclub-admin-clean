import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
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
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

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
    const existing = await SyncStateModel.findOne({ shopDomain, scope: syncScope })
      .select({ cursor: 1 })
      .lean();

    let cursor: string | null | undefined = full ? null : existing?.cursor || null;
    let importedCount = 0;

    do {
      const result: { importedCount: number; cursor: string | null } =
        scope === "artists"
          ? await pullArtists({ shopDomain, limit, cursor })
          : await pullProducts({ shopDomain, limit, cursor });

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

    return NextResponse.json(
      {
        ok: true,
        scope,
        importedCount,
        cursor: finalCursor,
        durationMs: Date.now() - startedAt,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pull from Shopify";
    await updateStateOnError(message);
    console.error("Failed to pull from Shopify", { scope, shopDomain, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
