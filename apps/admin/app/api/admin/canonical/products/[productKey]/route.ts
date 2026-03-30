import { isDeepStrictEqual } from "node:util";

import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import {
  CanonicalProductModel,
  canonicalProductOfferings,
  canonicalProductStatuses,
  canonicalProductTypes,
} from "@/models/CanonicalProduct";

const nullableTrimmedString = z.union([z.string(), z.null()]).transform((value) => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
});

const stringArray = z.array(z.string()).transform((values) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))),
);

const productPatchSchema = z
  .object({
    type: z.enum(canonicalProductTypes).optional(),
    title: z.string().trim().min(1).optional(),
    description: nullableTrimmedString.optional(),
    tags: stringArray.optional(),
    artistRef: nullableTrimmedString.optional(),
    images: z
      .object({
        thumbUrl: nullableTrimmedString.optional(),
        mediumUrl: nullableTrimmedString.optional(),
        originalUrl: nullableTrimmedString.optional(),
        galleryUrls: stringArray.optional(),
      })
      .strict()
      .optional(),
    offerings: z.enum(canonicalProductOfferings).optional(),
    status: z.enum(canonicalProductStatuses).optional(),
    dimensions: z
      .object({
        widthCm: z.union([z.number(), z.null()]).optional(),
        heightCm: z.union([z.number(), z.null()]).optional(),
      })
      .strict()
      .optional(),
    shortText: nullableTrimmedString.optional(),
  })
  .strict();

const editablePaths = [
  "type",
  "title",
  "description",
  "tags",
  "artistRef",
  "images.thumbUrl",
  "images.mediumUrl",
  "images.originalUrl",
  "images.galleryUrls",
  "offerings",
  "status",
  "dimensions.widthCm",
  "dimensions.heightCm",
  "shortText",
] as const;

function hasPath(obj: unknown, path: string): boolean {
  const parts = path.split(".");
  let cursor: unknown = obj;

  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || !(part in cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return true;
}

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = obj;

  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return cursor;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ productKey: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { productKey: rawProductKey } = await params;
  const productKey = rawProductKey?.trim();
  if (!productKey) {
    return NextResponse.json({ ok: false, error: "Invalid product key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = productPatchSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "Invalid payload" }, { status: 400 });
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: false, error: "No updatable fields provided" }, { status: 400 });
  }

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "Missing shop domain" }, { status: 500 });
  }

  await connectMongo();

  const existing = await CanonicalProductModel.findOne({ shopDomain, productKey }).lean();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Product not found" }, { status: 404 });
  }

  const changedFields: string[] = [];
  const setUpdates: Record<string, unknown> = {};

  for (const path of editablePaths) {
    if (!hasPath(parsed.data, path)) continue;
    const nextValue = getPath(parsed.data, path);
    const prevValue = getPath(existing, path);
    if (isDeepStrictEqual(prevValue, nextValue)) continue;
    changedFields.push(path);
    setUpdates[path] = nextValue;
  }

  if (!changedFields.length) {
    return NextResponse.json(
      {
        ok: true,
        productKey,
        updated: false,
        needsPush: Boolean(existing.sync?.needsPush),
        dirtyFields: Array.isArray(existing.sync?.dirtyFields) ? existing.sync?.dirtyFields : [],
      },
      { status: 200 },
    );
  }

  const dirtyFields = Array.from(
    new Set([
      ...(Array.isArray(existing.sync?.dirtyFields) ? existing.sync.dirtyFields : []),
      ...changedFields,
    ]),
  );

  setUpdates["sync.needsPush"] = true;
  setUpdates["sync.dirtyAt"] = new Date();
  setUpdates["sync.dirtyFields"] = dirtyFields;

  await CanonicalProductModel.updateOne({ shopDomain, productKey }, { $set: setUpdates });

  return NextResponse.json(
    {
      ok: true,
      productKey,
      updated: true,
      needsPush: true,
      dirtyFields,
    },
    { status: 200 },
  );
}
