import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosItemModel, posItemTypes, posVatRates } from "@/models/PosItem";

type CatalogListItem = {
  _id: { toString(): string };
  type: (typeof posItemTypes)[number];
  title: string;
  sku?: string;
  priceGrossCents: number;
  vatRate: (typeof posVatRates)[number];
  currency: "EUR";
  imageUrl?: string;
  artistName?: string;
  shopifyProductGid?: string;
  shopifyVariantGid?: string;
  tags?: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

const createEventSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  sku: z.string().trim().optional(),
  priceGrossCents: z.coerce.number().int().min(0, "priceGrossCents must be >= 0"),
  vatRate: z.enum(["0", "7", "19"]).transform((value) => Number(value) as (typeof posVatRates)[number]),
  imageUrl: z.string().trim().optional(),
  tags: z.array(z.string().trim()).optional(),
  isActive: z.boolean().optional(),
});

function normalizeString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTags(tags?: string[]) {
  if (!tags?.length) return [];
  const deduped = new Set(tags.map((tag) => tag.trim()).filter(Boolean));
  return Array.from(deduped);
}

function toPayload(row: CatalogListItem) {
  return {
    id: row._id.toString(),
    type: row.type,
    title: row.title,
    sku: row.sku ?? null,
    priceGrossCents: row.priceGrossCents,
    vatRate: row.vatRate,
    currency: row.currency,
    imageUrl: row.imageUrl ?? null,
    artistName: row.artistName ?? null,
    shopifyProductGid: row.shopifyProductGid ?? null,
    shopifyVariantGid: row.shopifyVariantGid ?? null,
    tags: row.tags || [],
    isActive: row.isActive,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  if (type !== null && type !== "artwork" && type !== "event") {
    return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
  }

  await connectMongo();
  const filter: Record<string, unknown> = {};
  if (type) filter.type = type;

  const rows = (await PosItemModel.find(filter).sort({ updatedAt: -1 }).lean()) as CatalogListItem[];
  return NextResponse.json(
    {
      ok: true,
      items: rows.map(toPayload),
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  try {
    await connectMongo();
    const created = await PosItemModel.create({
      type: "event",
      title: parsed.data.title,
      sku: normalizeString(parsed.data.sku),
      priceGrossCents: parsed.data.priceGrossCents,
      vatRate: parsed.data.vatRate,
      currency: "EUR",
      imageUrl: normalizeString(parsed.data.imageUrl),
      tags: normalizeTags(parsed.data.tags),
      isActive: parsed.data.isActive ?? true,
    });

    return NextResponse.json({ ok: true, item: toPayload(created.toObject() as CatalogListItem) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_create_event_item";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
