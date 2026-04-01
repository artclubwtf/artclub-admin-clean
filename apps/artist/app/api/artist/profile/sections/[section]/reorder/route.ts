import { NextResponse } from "next/server";

import { buildArtistSyncPatch } from "@/lib/server/artist-sync";
import {
  reorderItems,
  reorderSchema,
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
  type ArtistProfileSectionKey,
} from "@/lib/server/artist-profile-content";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { CanonicalArtistModel } from "@/lib/server/models";

const sectionConfigs = {
  experience: { field: "experience", serialize: serializeExperience },
  education: { field: "education", serialize: serializeEducation },
  exhibitions: { field: "exhibitions", serialize: serializeExhibitions },
  profileLinks: { field: "profileLinks", serialize: serializeProfileLinks },
} as const;

function getConfig(section: string) {
  if (!(section in sectionConfigs)) return null;
  return sectionConfigs[section as ArtistProfileSectionKey];
}

export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { section } = await params;
  const config = getConfig(section);
  if (!config) {
    return NextResponse.json({ ok: false, error: "invalid_section" }, { status: 404 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = reorderSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const artist = await CanonicalArtistModel.findById(context.canonicalArtist._id)
    .select({ [config.field]: 1, sync: 1 })
    .lean();
  if (!artist) {
    return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404 });
  }

  const currentItems = Array.isArray(artist[config.field as keyof typeof artist]) ? ((artist[config.field as keyof typeof artist] as any[]) || []) : [];
  const nextItems = reorderItems(
    currentItems.map((item, index) => ({
      ...item,
      id: item?.id || String(index),
      sortOrder: typeof item?.sortOrder === "number" ? item.sortOrder : index,
    })),
    parsed.data.ids,
  );

  const syncPatch = buildArtistSyncPatch({
    currentDirtyFields: artist.sync?.dirtyFields,
    changedFields: [config.field],
  });

  const updated = await CanonicalArtistModel.findOneAndUpdate(
    { _id: context.canonicalArtist._id, shopDomain: context.user.shopDomain, artistKey: context.user.artistKey },
    {
      $set: {
        [config.field]: nextItems,
        ...syncPatch,
      },
    },
    { new: true },
  ).lean();

  return NextResponse.json(
    {
      ok: true,
      items: config.serialize((updated?.[config.field as keyof typeof updated] as any[]) || []),
    },
    { status: 200 },
  );
}
