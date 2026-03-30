import { NextResponse } from "next/server";
import { z } from "zod";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { ArtistSeriesModel } from "@/models/ArtistSeries";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).optional().default(""),
    coverImageUrl: z.string().trim().url().optional(),
  })
  .strict();

export async function GET() {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const series = await ArtistSeriesModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json(
    {
      ok: true,
      series: series.map((item) => ({
        id: item._id.toString(),
        name: item.name,
        description: item.description || "",
        coverImageUrl: item.coverImageUrl || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const created = await ArtistSeriesModel.create({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    userId: context.user._id,
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
  });

  return NextResponse.json(
    {
      ok: true,
      series: {
        id: created._id.toString(),
        name: created.name,
        description: created.description || "",
        coverImageUrl: created.coverImageUrl || "",
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    },
    { status: 201 },
  );
}
