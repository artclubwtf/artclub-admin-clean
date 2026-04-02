import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { canonicalStatusValues } from "@/models/canonicalStates";

const payloadSchema = z
  .object({
    artistKey: z.string().trim().optional().or(z.literal("")),
    migrationStatus: z.enum(["unassigned", "suggested", "assigned", "needs_review"]).optional(),
    approvalStatus: z.enum(canonicalStatusValues).optional().or(z.literal("")),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ productKey: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { productKey: rawProductKey } = await params;
  const productKey = rawProductKey?.trim();
  if (!productKey) {
    return NextResponse.json({ ok: false, error: "invalid_product_key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
  }

  await connectMongo();

  const product = await CanonicalProductModel.findOne({ shopDomain, productKey }).lean();
  if (!product) {
    return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
  }

  const selectedArtistKey = parsed.data.artistKey?.trim() || "";
  let artistRef: string | null = null;

  if (selectedArtistKey) {
    const artist = await CanonicalArtistModel.findOne({ shopDomain, artistKey: selectedArtistKey })
      .select({ artistKey: 1, shopifyMetaobjectId: 1, shopify: 1 })
      .lean();
    if (!artist) {
      return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404 });
    }
    artistRef = artist.shopifyMetaobjectId || artist.shopify?.metaobjectGid || null;
  }

  const migrationStatus = parsed.data.migrationStatus || (selectedArtistKey ? "assigned" : "needs_review");
  const approvalStatus = parsed.data.approvalStatus?.trim() || product.approvalStatus || "needs_review";

  const dirtyFields = Array.from(
    new Set([
      ...(Array.isArray(product.sync?.dirtyFields) ? product.sync.dirtyFields : []),
      "artistKey",
      "artistRef",
      "migrationStatus",
      "approvalStatus",
      "type",
    ]),
  );

  await CanonicalProductModel.updateOne(
    { shopDomain, productKey },
    {
      $set: {
        type: "artwork",
        artistKey: selectedArtistKey || null,
        artistRef,
        migrationStatus,
        approvalStatus,
        "sync.needsPush": true,
        "sync.dirtyAt": new Date(),
        "sync.dirtyFields": dirtyFields,
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      productKey,
      artistKey: selectedArtistKey,
      artistRef,
      migrationStatus,
      approvalStatus,
      type: "artwork",
      dirtyFields,
    },
    { status: 200 },
  );
}
