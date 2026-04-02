import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { isShopifyWriteEnabled } from "@/lib/featureFlags";
import { requireAdmin } from "@/lib/requireAdmin";
import { getArtistShopifySyncMode } from "@/lib/artistShopifySyncMode";
import { resolveShopDomain } from "@/lib/shopDomain";
import { pushArtists, pushProducts } from "@/lib/sync/shopifyPush";
import { SyncStateModel } from "@/models/SyncState";

const payloadSchema = z.object({
  scope: z.enum(["artists", "products"]),
  limit: z.number().int().min(1).max(250).optional(),
});

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  if (!isShopifyWriteEnabled()) {
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
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing Shopify shop domain" }, { status: 500 });
  }

  await connectMongo();

  try {
    const result = scope === "artists" ? await pushArtists({ shopDomain, limit }) : await pushProducts({ shopDomain, limit });
    const artistSyncMode = scope === "artists" ? getArtistShopifySyncMode() : undefined;

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

    return NextResponse.json(
      {
        ok: true,
        scope,
        pushedCount: result.pushedCount,
        failedCount: result.failedCount,
        durationMs: Date.now() - startedAt,
        errors: result.errors,
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
