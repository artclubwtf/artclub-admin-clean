import { NextResponse } from "next/server";
import { z } from "zod";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { CanonicalProductModel, canonicalProductOfferings } from "@/models/CanonicalProduct";
import { ArtistSeriesModel } from "@/models/ArtistSeries";

const updateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    description: z.string().trim().max(4000).optional(),
    shortText: z.string().trim().max(1000).optional(),
    offerings: z.enum(canonicalProductOfferings).optional(),
    forSale: z.boolean().optional(),
    allowPrints: z.boolean().optional(),
    originalAvailable: z.boolean().optional(),
    seriesId: z.string().trim().optional().or(z.literal("")),
  })
  .strict();

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const { id } = await params;
  const artwork = await CanonicalProductModel.findOne({
    shopDomain: context.user.shopDomain,
    canonicalArtistId: context.canonicalArtist._id,
    productKey: id,
    type: "artwork",
  }).lean();

  if (!artwork) {
    return NextResponse.json({ ok: false, error: "artwork_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      artwork: {
        id: artwork._id.toString(),
        productKey: artwork.productKey,
        title: artwork.title,
        description: artwork.description || "",
        shortText: artwork.shortText || "",
        year: artwork.year ?? null,
        offerings: artwork.offerings,
        forSale: artwork.forSale !== false,
        allowPrints: artwork.allowPrints === true,
        originalAvailable: artwork.originalAvailable === true,
        seriesId: artwork.seriesId || "",
        seriesName: artwork.seriesName || "",
        status: artwork.status,
        images: {
          thumbUrl: artwork.images?.thumbUrl || "",
          mediumUrl: artwork.images?.mediumUrl || "",
          originalUrl: artwork.images?.originalUrl || "",
          galleryUrls: Array.isArray(artwork.images?.galleryUrls) ? artwork.images?.galleryUrls : [],
        },
      },
    },
    { status: 200 },
  );
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const { id } = await params;
  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = updateSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description || undefined;
  if (data.shortText !== undefined) updates.shortText = data.shortText || undefined;
  if (data.year !== undefined) updates.year = data.year === null ? undefined : data.year;
  if (data.offerings !== undefined) updates.offerings = data.offerings;
  if (data.forSale !== undefined) updates.forSale = data.forSale;
  if (data.allowPrints !== undefined) updates.allowPrints = data.allowPrints;
  if (data.originalAvailable !== undefined) updates.originalAvailable = data.originalAvailable;

  if (data.seriesId !== undefined) {
    if (!data.seriesId) {
      updates.seriesId = undefined;
      updates.seriesName = undefined;
    } else {
      const series = await ArtistSeriesModel.findOne({
        _id: data.seriesId,
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
      })
        .select({ _id: 1, name: 1 })
        .lean();
      if (!series) {
        return NextResponse.json({ ok: false, error: "series_not_found" }, { status: 404 });
      }
      updates.seriesId = series._id.toString();
      updates.seriesName = series.name;
    }
  }

  const updated = await CanonicalProductModel.findOneAndUpdate(
    {
      shopDomain: context.user.shopDomain,
      canonicalArtistId: context.canonicalArtist._id,
      productKey: id,
      type: "artwork",
    },
    {
      $set: {
        ...updates,
        "sync.needsPush": true,
        "sync.dirtyAt": new Date(),
      },
    },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "artwork_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      artwork: {
        id: updated._id.toString(),
        productKey: updated.productKey,
        title: updated.title,
        description: updated.description || "",
        shortText: updated.shortText || "",
        year: updated.year ?? null,
        offerings: updated.offerings,
        forSale: updated.forSale !== false,
        allowPrints: updated.allowPrints === true,
        originalAvailable: updated.originalAvailable === true,
        seriesId: updated.seriesId || "",
        seriesName: updated.seriesName || "",
        status: updated.status,
      },
    },
    { status: 200 },
  );
}
