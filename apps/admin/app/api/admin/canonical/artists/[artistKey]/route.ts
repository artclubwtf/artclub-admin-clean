import { isDeepStrictEqual } from "node:util";

import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";

const nullableTrimmedString = z.union([z.string(), z.null()]).transform((value) => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
});

const stringArray = z.array(z.string()).transform((values) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))),
);

const artistPatchSchema = z
  .object({
    handle: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
    email: nullableTrimmedString.optional(),
    instagram: nullableTrimmedString.optional(),
    profileImages: z
      .object({
        avatarUrl: nullableTrimmedString.optional(),
        heroUrl: nullableTrimmedString.optional(),
        galleryUrls: stringArray.optional(),
      })
      .strict()
      .optional(),
    consents: z
      .object({
        allowOriginalSales: z.boolean().optional(),
        allowPrintSales: z.boolean().optional(),
        allowRental: z.boolean().optional(),
        allowExhibitions: z.boolean().optional(),
        presentationOnly: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const editablePaths = [
  "handle",
  "displayName",
  "email",
  "instagram",
  "profileImages.avatarUrl",
  "profileImages.heroUrl",
  "profileImages.galleryUrls",
  "consents.allowOriginalSales",
  "consents.allowPrintSales",
  "consents.allowRental",
  "consents.allowExhibitions",
  "consents.presentationOnly",
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

export async function PATCH(req: Request, { params }: { params: Promise<{ artistKey: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { artistKey: rawArtistKey } = await params;
  const artistKey = rawArtistKey?.trim();
  if (!artistKey) {
    return NextResponse.json({ ok: false, error: "Invalid artist key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = artistPatchSchema.safeParse(body || {});
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

  const existing = await CanonicalArtistModel.findOne({ shopDomain, artistKey }).lean();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Artist not found" }, { status: 404 });
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
        artistKey,
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

  await CanonicalArtistModel.updateOne({ shopDomain, artistKey }, { $set: setUpdates });

  return NextResponse.json(
    {
      ok: true,
      artistKey,
      updated: true,
      needsPush: true,
      dirtyFields,
    },
    { status: 200 },
  );
}
