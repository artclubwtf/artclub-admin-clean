import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosItemModel, posVatRates } from "@/models/PosItem";

type CatalogListItem = {
  _id: { toString(): string };
  type: "artwork" | "event";
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

const patchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    sku: z.string().trim().optional(),
    priceGrossCents: z.coerce.number().int().min(0).optional(),
    vatRate: z.enum(["0", "7", "19"]).transform((value) => Number(value) as (typeof posVatRates)[number]).optional(),
    imageUrl: z.string().trim().optional(),
    tags: z.array(z.string().trim()).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "no_fields_to_update" });

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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  const setUpdates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) setUpdates.title = parsed.data.title;
  if (parsed.data.sku !== undefined) setUpdates.sku = normalizeString(parsed.data.sku) ?? null;
  if (parsed.data.priceGrossCents !== undefined) setUpdates.priceGrossCents = parsed.data.priceGrossCents;
  if (parsed.data.vatRate !== undefined) setUpdates.vatRate = parsed.data.vatRate;
  if (parsed.data.imageUrl !== undefined) setUpdates.imageUrl = normalizeString(parsed.data.imageUrl) ?? null;
  if (parsed.data.tags !== undefined) setUpdates.tags = normalizeTags(parsed.data.tags);
  if (parsed.data.isActive !== undefined) setUpdates.isActive = parsed.data.isActive;

  await connectMongo();
  const updated = (await PosItemModel.findOneAndUpdate(
    { _id: id, type: "event" },
    { $set: setUpdates },
    { new: true },
  ).lean()) as CatalogListItem | null;

  if (!updated) {
    return NextResponse.json({ ok: false, error: "event_item_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: toPayload(updated) }, { status: 200 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  await connectMongo();
  const updated = (await PosItemModel.findOneAndUpdate(
    { _id: id, type: "event" },
    { $set: { isActive: false } },
    { new: true },
  ).lean()) as CatalogListItem | null;

  if (!updated) {
    return NextResponse.json({ ok: false, error: "event_item_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: toPayload(updated) }, { status: 200 });
}
