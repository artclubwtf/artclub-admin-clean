import { NextResponse } from "next/server";
import { z } from "zod";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { ArtistAnnouncementModel } from "@/lib/server/models";

const dateStringSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "invalid_date");

const announcementCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    body: z.string().trim().min(1).max(4000),
    ctaLabel: z.string().trim().max(120).optional().default(""),
    ctaUrl: z.string().trim().url().optional().or(z.literal("")),
    startsAt: dateStringSchema,
    endsAt: dateStringSchema,
    isPinned: z.boolean().optional().default(false),
    isPublished: z.boolean().optional().default(false),
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

export async function GET() {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const announcements = await ArtistAnnouncementModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  return NextResponse.json(
    {
      ok: true,
      announcements: announcements.map(serializeAnnouncement),
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = announcementCreateSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const last = await ArtistAnnouncementModel.findOne({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ sortOrder: -1 })
    .select({ sortOrder: 1 })
    .lean();

  const created = await ArtistAnnouncementModel.create({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    userId: context.user._id,
    title: parsed.data.title,
    body: parsed.data.body,
    ctaLabel: parsed.data.ctaLabel || undefined,
    ctaUrl: parsed.data.ctaUrl || undefined,
    startsAt: parseDateInput(parsed.data.startsAt || undefined),
    endsAt: parseDateInput(parsed.data.endsAt || undefined),
    isPinned: parsed.data.isPinned,
    isPublished: parsed.data.isPublished,
    sortOrder: (last?.sortOrder || 0) + 1,
  });

  return NextResponse.json({ ok: true, announcement: serializeAnnouncement(created) }, { status: 201 });
}
