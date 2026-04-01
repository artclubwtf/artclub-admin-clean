import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { ArtistAnnouncementModel } from "@/lib/server/models";
import { z } from "zod";

const dateStringSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "invalid_date");

const announcementPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    body: z.string().trim().min(1).max(4000).optional(),
    ctaLabel: z.string().trim().max(120).optional(),
    ctaUrl: z.string().trim().url().optional().or(z.literal("")),
    startsAt: dateStringSchema,
    endsAt: dateStringSchema,
    isPinned: z.boolean().optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

function parseDateInput(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function serializeAnnouncement(item: any) {
  return {
    id: item._id.toString(),
    title: item.title,
    body: item.body || "",
    ctaLabel: item.ctaLabel || "",
    ctaUrl: item.ctaUrl || "",
    startsAt: item.startsAt ? new Date(item.startsAt).toISOString().slice(0, 10) : "",
    endsAt: item.endsAt ? new Date(item.endsAt).toISOString().slice(0, 10) : "",
    isPinned: item.isPinned === true,
    isPublished: item.isPublished === true,
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_announcement_id" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = announcementPatchSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.ctaLabel !== undefined) updates.ctaLabel = parsed.data.ctaLabel || undefined;
  if (parsed.data.ctaUrl !== undefined) updates.ctaUrl = parsed.data.ctaUrl || undefined;
  if (parsed.data.startsAt !== undefined) updates.startsAt = parseDateInput(parsed.data.startsAt || undefined);
  if (parsed.data.endsAt !== undefined) updates.endsAt = parseDateInput(parsed.data.endsAt || undefined);
  if (parsed.data.isPinned !== undefined) updates.isPinned = parsed.data.isPinned;
  if (parsed.data.isPublished !== undefined) updates.isPublished = parsed.data.isPublished;

  const updated = await ArtistAnnouncementModel.findOneAndUpdate(
    { _id: id, shopDomain: context.user.shopDomain, artistKey: context.user.artistKey },
    { $set: updates },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ ok: false, error: "announcement_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, announcement: serializeAnnouncement(updated) }, { status: 200 });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_announcement_id" }, { status: 400 });
  }

  const deleted = await ArtistAnnouncementModel.findOneAndDelete({
    _id: id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  }).lean();

  if (!deleted) {
    return NextResponse.json({ ok: false, error: "announcement_not_found" }, { status: 404 });
  }

  const remaining = await ArtistAnnouncementModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  await Promise.all(
    remaining.map((item, index) =>
      ArtistAnnouncementModel.updateOne({ _id: item._id }, { $set: { sortOrder: index } }),
    ),
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
