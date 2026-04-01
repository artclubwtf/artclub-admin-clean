import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { ArtistSeriesModel, CanonicalProductModel } from "@/lib/server/models";

const bodySchema = z
  .object({
    productKeys: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_series_id" }, { status: 400 });
  }

  const series = await ArtistSeriesModel.findOne({
    _id: id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .select({ _id: 1, name: 1 })
    .lean();

  if (!series) {
    return NextResponse.json({ ok: false, error: "series_not_found" }, { status: 404 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const productKeys = Array.from(new Set(parsed.data.productKeys.map((key) => key.trim()).filter(Boolean)));
  const existingProducts = productKeys.length
    ? await CanonicalProductModel.find({
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        type: "artwork",
        productKey: { $in: productKeys },
      })
        .select({ productKey: 1 })
        .lean()
    : [];

  if (existingProducts.length !== productKeys.length) {
    return NextResponse.json({ ok: false, error: "artwork_not_found" }, { status: 404 });
  }

  await CanonicalProductModel.updateMany(
    {
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      type: "artwork",
      seriesId: id,
      productKey: { $nin: productKeys },
    },
    { $unset: { seriesId: 1, seriesName: 1 } },
  );

  if (productKeys.length) {
    await CanonicalProductModel.updateMany(
      {
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        type: "artwork",
        productKey: { $in: productKeys },
      },
      {
        $set: {
          seriesId: id,
          seriesName: series.name,
        },
      },
    );
  }

  const assigned = await CanonicalProductModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    type: "artwork",
    seriesId: id,
  })
    .select({ productKey: 1, title: 1 })
    .sort({ title: 1 })
    .lean();

  return NextResponse.json(
    {
      ok: true,
      artworks: assigned.map((item) => ({
        productKey: item.productKey,
        title: item.title,
      })),
    },
    { status: 200 },
  );
}
