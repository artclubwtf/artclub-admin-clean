import { NextResponse } from "next/server";
import { z } from "zod";

import { buildArtistSyncPatch } from "@/lib/server/artist-sync";
import {
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
    patchSchema: experienceCreateSchema.partial(),
    serialize: serializeExperience,
  },
  education: {
    field: "education",
    patchSchema: educationCreateSchema.partial(),
    serialize: serializeEducation,
  },
  exhibitions: {
    field: "exhibitions",
    patchSchema: exhibitionCreateSchema.partial(),
    serialize: serializeExhibitions,
  },
  profileLinks: {
    field: "profileLinks",
    patchSchema: profileLinkCreateSchema.partial(),
    serialize: serializeProfileLinks,
  },
} as const;

function getConfig(section: string) {
  if (!(section in sectionConfigs)) return null;
  return sectionConfigs[section as ArtistProfileSectionKey];
}

function parseDateInput(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function applyPatch(section: ArtistProfileSectionKey, current: any, patch: Record<string, unknown>) {
  switch (section) {
    case "experience":
      return {
        ...current,
        ...(patch.title !== undefined ? { title: patch.title || undefined } : {}),
        ...(patch.organization !== undefined ? { organization: patch.organization || undefined } : {}),
        ...(patch.employmentType !== undefined ? { employmentType: patch.employmentType || undefined } : {}),
        ...(patch.location !== undefined ? { location: patch.location || undefined } : {}),
        ...(patch.locationType !== undefined ? { locationType: patch.locationType || undefined } : {}),
        ...(patch.startDate !== undefined ? { startDate: parseDateInput(patch.startDate) } : {}),
        ...(patch.endDate !== undefined
          ? { endDate: patch.isCurrent === true ? undefined : parseDateInput(patch.endDate) }
          : patch.isCurrent === true
            ? { endDate: undefined }
            : {}),
        ...(patch.isCurrent !== undefined ? { isCurrent: patch.isCurrent === true } : {}),
        ...(patch.description !== undefined ? { description: patch.description || undefined } : {}),
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl || undefined } : {}),
      };
    case "education":
      return {
        ...current,
        ...(patch.school !== undefined ? { school: patch.school || undefined } : {}),
        ...(patch.degree !== undefined ? { degree: patch.degree || undefined } : {}),
        ...(patch.fieldOfStudy !== undefined ? { fieldOfStudy: patch.fieldOfStudy || undefined } : {}),
        ...(patch.startDate !== undefined ? { startDate: parseDateInput(patch.startDate) } : {}),
        ...(patch.endDate !== undefined ? { endDate: parseDateInput(patch.endDate) } : {}),
        ...(patch.grade !== undefined ? { grade: patch.grade || undefined } : {}),
        ...(patch.activities !== undefined ? { activities: patch.activities || undefined } : {}),
        ...(patch.description !== undefined ? { description: patch.description || undefined } : {}),
        ...(patch.courses !== undefined ? { courses: patch.courses || undefined } : {}),
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl || undefined } : {}),
      };
    case "exhibitions":
      return {
        ...current,
        ...(patch.title !== undefined ? { title: patch.title || undefined } : {}),
        ...(patch.venue !== undefined ? { venue: patch.venue || undefined } : {}),
        ...(patch.exhibitionType !== undefined ? { exhibitionType: patch.exhibitionType || undefined } : {}),
        ...(patch.city !== undefined ? { city: patch.city || undefined } : {}),
        ...(patch.country !== undefined ? { country: patch.country || undefined } : {}),
        ...(patch.startDate !== undefined ? { startDate: parseDateInput(patch.startDate) } : {}),
        ...(patch.endDate !== undefined
          ? { endDate: patch.isOngoing === true ? undefined : parseDateInput(patch.endDate) }
          : patch.isOngoing === true
            ? { endDate: undefined }
            : {}),
        ...(patch.isOngoing !== undefined ? { isOngoing: patch.isOngoing === true } : {}),
        ...(patch.description !== undefined ? { description: patch.description || undefined } : {}),
        ...(patch.link !== undefined ? { link: patch.link || undefined } : {}),
        ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl || undefined } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility || "public" } : {}),
      };
    case "profileLinks":
      return {
        ...current,
        ...(patch.label !== undefined ? { label: patch.label || undefined } : {}),
        ...(patch.url !== undefined ? { url: patch.url || undefined } : {}),
        ...(patch.type !== undefined ? { type: patch.type || "custom" } : {}),
        ...(patch.isVisible !== undefined ? { isVisible: patch.isVisible !== false } : {}),
        ...(patch.isHighlighted !== undefined ? { isHighlighted: patch.isHighlighted === true } : {}),
      };
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ section: string; id: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { section, id } = await params;
  const config = getConfig(section);
  if (!config) {
    return NextResponse.json({ ok: false, error: "invalid_section" }, { status: 404 });
  }

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = config.patchSchema.safeParse(payload || {});
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
  const currentIndex = currentItems.findIndex((item) => item?.id === id);
  if (currentIndex === -1) {
    return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
  }

  const nextItems = [...currentItems];
  nextItems[currentIndex] = applyPatch(section as ArtistProfileSectionKey, currentItems[currentIndex], parsed.data);

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
  const item = serialized.find((entry) => entry.id === id) || null;
  return NextResponse.json({ ok: true, item, items: serialized }, { status: 200 });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ section: string; id: string }> }) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { section, id } = await params;
  const config = getConfig(section);
  if (!config) {
    return NextResponse.json({ ok: false, error: "invalid_section" }, { status: 404 });
  }

  const artist = await CanonicalArtistModel.findById(context.canonicalArtist._id)
    .select({ [config.field]: 1, sync: 1 })
    .lean();
  if (!artist) {
    return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404 });
  }

  const currentItems = Array.isArray(artist[config.field as keyof typeof artist]) ? ((artist[config.field as keyof typeof artist] as any[]) || []) : [];
  const nextItems = currentItems
    .filter((item) => item?.id !== id)
    .map((item, index) => ({
      ...item,
      sortOrder: index,
    }));

  if (nextItems.length === currentItems.length) {
    return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
  }

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
