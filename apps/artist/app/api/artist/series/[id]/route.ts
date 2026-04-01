import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import { ArtistSeriesModel, CanonicalProductModel } from "@/lib/server/models";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(4000).optional(),
    coverImageUrl: z.string().trim().url().optional().or(z.literal("")),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_series_id" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description || undefined;
  if (parsed.data.coverImageUrl !== undefined) updates.coverImageUrl = parsed.data.coverImageUrl || undefined;

  const updated = await ArtistSeriesModel.findOneAndUpdate(
    { _id: id, shopDomain: context.user.shopDomain, artistKey: context.user.artistKey },
    { $set: updates },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "series_not_found" }, { status: 404 });
  }

  if (parsed.data.name !== undefined) {
    await CanonicalProductModel.updateMany(
      {
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        seriesId: updated._id.toString(),
      },
      { $set: { seriesName: updated.name } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      series: {
        id: updated._id.toString(),
        name: updated.name,
        description: updated.description || "",
        coverImageUrl: updated.coverImageUrl || "",
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    },
    { status: 200 },
  );
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_series_id" }, { status: 400 });
  }

  const deleted = await ArtistSeriesModel.findOneAndDelete({
    _id: id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  }).lean();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "series_not_found" }, { status: 404 });
  }

  await CanonicalProductModel.updateMany(
    {
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      seriesId: id,
    },
    { $unset: { seriesId: 1, seriesName: 1 } },
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
