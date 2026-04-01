import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { ArtistAnnouncementModel } from "@/lib/server/models";

const reorderSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = reorderSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const validIds = parsed.data.ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  if (validIds.length !== parsed.data.ids.length) {
    return NextResponse.json({ ok: false, error: "invalid_announcement_ids" }, { status: 400 });
  }

  const announcements = await ArtistAnnouncementModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  const byId = new Map(announcements.map((item) => [item._id.toString(), item]));
  const ordered = parsed.data.ids.map((id) => byId.get(id)).filter(Boolean) as typeof announcements;
  const remaining = announcements.filter((item) => !parsed.data.ids.includes(item._id.toString()));
  const next = [...ordered, ...remaining];

  await ArtistAnnouncementModel.bulkWrite(
    next.map((item, index) => ({
      updateOne: {
        filter: { _id: item._id, shopDomain: context.user.shopDomain, artistKey: context.user.artistKey },
        update: { $set: { sortOrder: index } },
      },
    })),
  );

  const updated = await ArtistAnnouncementModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  return NextResponse.json(
    {
      ok: true,
      announcements: updated.map((item) => ({
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
      })),
    },
    { status: 200 },
  );
}
