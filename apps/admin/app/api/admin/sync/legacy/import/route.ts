import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { importLegacyArtistsToCanonical } from "@/lib/sync/legacyImport";

const payloadSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
});

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing shop domain" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  await connectMongo();

  try {
    const result = await importLegacyArtistsToCanonical({
      shopDomain,
      limit: parsed.data.limit,
    });

    return NextResponse.json(
      {
        ok: true,
        scope: "legacy_artists",
        ...result,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "legacy_import_failed" },
      { status: 500 },
    );
  }
}
