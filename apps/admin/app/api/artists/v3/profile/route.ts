import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireArtistV2Context } from "@/lib/artistV2Context";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

const patchSchema = z
  .object({
    displayName: z.string().trim().min(2).optional(),
    handle: z.string().trim().min(2).optional(),
    instagram: z.string().trim().optional(),
    websiteUrl: z.string().trim().url().optional().or(z.literal("")),
    locationCity: z.string().trim().optional(),
    locationCountry: z.string().trim().optional(),
    bio: z.string().trim().max(4000).optional(),
    profileImages: z
      .object({
        avatarUrl: z.string().trim().optional(),
        heroUrl: z.string().trim().optional(),
        galleryUrls: z.array(z.string().trim()).optional(),
      })
      .optional(),
  })
  .strict();

function normalizeGallery(values?: string[]) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, 12);
}

export async function GET() {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const { canonicalArtist, user } = context;

  return NextResponse.json(
    {
      ok: true,
      profile: {
        artistKey: user.artistKey,
        email: user.email,
        displayName: canonicalArtist.displayName || user.name || "",
        handle: canonicalArtist.handle || user.artistKey,
        instagram: canonicalArtist.instagram || "",
        websiteUrl: canonicalArtist.websiteUrl || "",
        locationCity: canonicalArtist.locationCity || "",
        locationCountry: canonicalArtist.locationCountry || "",
        bio: canonicalArtist.bio || "",
        profileImages: {
          avatarUrl: canonicalArtist.profileImages?.avatarUrl || "",
          heroUrl: canonicalArtist.profileImages?.heroUrl || "",
          galleryUrls: Array.isArray(canonicalArtist.profileImages?.galleryUrls) ? canonicalArtist.profileImages?.galleryUrls : [],
        },
      },
    },
    { status: 200 },
  );
}

export async function PATCH(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
  if (parsed.data.handle !== undefined) updates.handle = parsed.data.handle;
  if (parsed.data.instagram !== undefined) updates.instagram = parsed.data.instagram || undefined;
  if (parsed.data.websiteUrl !== undefined) updates.websiteUrl = parsed.data.websiteUrl || undefined;
  if (parsed.data.locationCity !== undefined) updates.locationCity = parsed.data.locationCity || undefined;
  if (parsed.data.locationCountry !== undefined) updates.locationCountry = parsed.data.locationCountry || undefined;
  if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio || undefined;
  if (parsed.data.profileImages) {
    updates.profileImages = {
      avatarUrl: parsed.data.profileImages.avatarUrl?.trim() || undefined,
      heroUrl: parsed.data.profileImages.heroUrl?.trim() || undefined,
      galleryUrls: normalizeGallery(parsed.data.profileImages.galleryUrls),
    };
  }

  const updated = await CanonicalArtistModel.findOneAndUpdate(
    { _id: context.canonicalArtist._id, shopDomain: context.user.shopDomain, artistKey: context.user.artistKey },
    { $set: updates },
    { new: true },
  ).lean();

  if (parsed.data.displayName) {
    await UserModel.updateOne({ _id: context.user._id }, { $set: { name: parsed.data.displayName } });
  }

  return NextResponse.json(
    {
      ok: true,
      profile: {
        artistKey: context.user.artistKey,
        email: context.user.email,
        displayName: updated?.displayName || "",
        handle: updated?.handle || context.user.artistKey,
        instagram: updated?.instagram || "",
        websiteUrl: updated?.websiteUrl || "",
        locationCity: updated?.locationCity || "",
        locationCountry: updated?.locationCountry || "",
        bio: updated?.bio || "",
        profileImages: {
          avatarUrl: updated?.profileImages?.avatarUrl || "",
          heroUrl: updated?.profileImages?.heroUrl || "",
          galleryUrls: Array.isArray(updated?.profileImages?.galleryUrls) ? updated?.profileImages?.galleryUrls : [],
        },
      },
    },
    { status: 200 },
  );
}
