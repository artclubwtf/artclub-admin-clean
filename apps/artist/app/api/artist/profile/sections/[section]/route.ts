import { NextResponse } from "next/server";
import { z } from "zod";

import { buildArtistSyncPatch } from "@/lib/server/artist-sync";
import {
  createEducationEntry,
  createExhibitionEntry,
  createExperienceEntry,
  createProfileLinkEntry,
  educationCreateSchema,
  exhibitionCreateSchema,
  experienceCreateSchema,
  profileLinkCreateSchema,
  serializeEducation,
  serializeExhibitions,
  serializeExperience,
  serializeProfileLinks,
  type ArtistProfileSectionKey,
} from "@/lib/server/artist-profile-content";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { CanonicalArtistModel } from "@/lib/server/models";

const sectionConfigs = {
  experience: {
    field: "experience",
    createSchema: experienceCreateSchema,
    serialize: serializeExperience,
    create: createExperienceEntry,
  },
  education: {
    field: "education",
    createSchema: educationCreateSchema,
    serialize: serializeEducation,
    create: createEducationEntry,
  },
  exhibitions: {
    field: "exhibitions",
    createSchema: exhibitionCreateSchema,
    serialize: serializeExhibitions,
    create: createExhibitionEntry,
  },
  profileLinks: {
    field: "profileLinks",
    createSchema: profileLinkCreateSchema,
    serialize: serializeProfileLinks,
    create: createProfileLinkEntry,
  },
} as const;

function getConfig(section: string) {
  if (!(section in sectionConfigs)) return null;
  return sectionConfigs[section as ArtistProfileSectionKey];
}

export async function GET(_: Request, { params }: { params: Promise<{ section: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { section } = await params;
  const config = getConfig(section);
  if (!config) {
    return NextResponse.json({ ok: false, error: "invalid_section" }, { status: 404 });
  }

  const artist = await CanonicalArtistModel.findById(context.canonicalArtist._id)
    .select({ [config.field]: 1 })
    .lean();

  return NextResponse.json(
    {
      ok: true,
      items: config.serialize((artist?.[config.field as keyof typeof artist] as any[]) || []),
    },
    { status: 200 },
  );
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
  const parsed = config.createSchema.safeParse(payload || {});
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
  const nextItems = [...currentItems, config.create(parsed.data as never, currentItems)];

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

  const serialized = config.serialize((updated?.[config.field as keyof typeof updated] as any[]) || []);
  return NextResponse.json(
    {
      ok: true,
      item: serialized[serialized.length - 1],
      items: serialized,
    },
    { status: 201 },
  );
}
