import { NextResponse } from "next/server";
import { z } from "zod";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { ArtistMediaV2Model, artistMediaV2Kinds } from "@/models/ArtistMediaV2";

const createMediaSchema = z
  .object({
    kind: z.enum(artistMediaV2Kinds).default("artwork"),
    fileIdGid: z.string().trim().optional(),
    filename: z.string().trim().optional(),
    mimeType: z.string().trim().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    url: z.string().trim().url(),
    previewUrl: z.string().trim().url().optional(),
  })
  .strict();

export async function GET(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const filter: Record<string, unknown> = {
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  };
  if (kind && artistMediaV2Kinds.includes(kind as (typeof artistMediaV2Kinds)[number])) {
    filter.kind = kind;
  }

  const media = await ArtistMediaV2Model.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(
    {
      ok: true,
      media: media.map((item) => ({
        id: item._id.toString(),
        kind: item.kind,
        fileIdGid: item.fileIdGid || null,
        filename: item.filename || "",
        mimeType: item.mimeType || "",
        sizeBytes: item.sizeBytes ?? null,
        url: item.url,
        previewUrl: item.previewUrl || item.url,
        createdAt: item.createdAt,
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
  const parsed = createMediaSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const created = await ArtistMediaV2Model.create({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    userId: context.user._id,
    kind: parsed.data.kind,
    fileIdGid: parsed.data.fileIdGid || undefined,
    filename: parsed.data.filename || undefined,
    mimeType: parsed.data.mimeType || undefined,
    sizeBytes: parsed.data.sizeBytes,
    url: parsed.data.url,
    previewUrl: parsed.data.previewUrl || parsed.data.url,
  });

  return NextResponse.json(
    {
      ok: true,
      media: {
        id: created._id.toString(),
        kind: created.kind,
        fileIdGid: created.fileIdGid || null,
        filename: created.filename || "",
        mimeType: created.mimeType || "",
        sizeBytes: created.sizeBytes ?? null,
        url: created.url,
        previewUrl: created.previewUrl || created.url,
        createdAt: created.createdAt,
      },
    },
    { status: 201 },
  );
}
