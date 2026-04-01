import { NextResponse } from "next/server";
import { z } from "zod";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { buildArtistSyncPatch } from "@/lib/server/artist-sync";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { normalizePublicArtistMediaUrl, normalizePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { CanonicalArtistModel, UserModel } from "@/lib/server/models";

const patchSchema = z
  .object({
    displayName: z.string().trim().min(2),
    handle: z.string().trim().min(2),
    locationCity: z.string().trim().optional().default(""),
    locationCountry: z.string().trim().optional().default(""),
    bio: z.string().trim().max(4000).optional().default(""),
    publicProfileVisible: z.boolean().optional(),
    avatarUrl: z.string().trim().optional().default(""),
    heroUrl: z.string().trim().optional().default(""),
    galleryUrls: z.array(z.string().trim()).optional().default([]),
  })
  .strict();

function normalizeGallery(values?: string[]) {
  if (!Array.isArray(values)) return [];
  return normalizePublicArtistMediaUrls(values.map((value) => value.trim()).filter(Boolean)).slice(0, 12);
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;

    const payload = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(payload || {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const avatarUrl = normalizePublicArtistMediaUrl(parsed.data.avatarUrl.trim());
    const heroUrl = normalizePublicArtistMediaUrl(parsed.data.heroUrl.trim());
    const galleryUrls = normalizeGallery(parsed.data.galleryUrls);
    const changedFields: string[] = [];
    if ((context.canonicalArtist.displayName || "") !== parsed.data.displayName) changedFields.push("displayName");
    if ((context.canonicalArtist.handle || "") !== parsed.data.handle) changedFields.push("handle");
    if ((context.canonicalArtist.locationCity || "") !== parsed.data.locationCity.trim()) changedFields.push("locationCity");
    if ((context.canonicalArtist.locationCountry || "") !== parsed.data.locationCountry.trim()) changedFields.push("locationCountry");
    if ((context.canonicalArtist.bio || "") !== parsed.data.bio.trim()) changedFields.push("bio");
    if ((context.canonicalArtist.profileImages?.avatarUrl || "") !== avatarUrl) changedFields.push("profileImages.avatarUrl");
    if ((context.canonicalArtist.profileImages?.heroUrl || "") !== heroUrl) changedFields.push("profileImages.heroUrl");
    if ((context.canonicalArtist.publicProfile?.isVisible !== false) !== (parsed.data.publicProfileVisible !== false)) {
      changedFields.push("publicProfile.isVisible");
    }
    if (JSON.stringify(context.canonicalArtist.profileImages?.galleryUrls || []) !== JSON.stringify(galleryUrls)) {
      changedFields.push("profileImages.galleryUrls");
    }

    const syncPatch = buildArtistSyncPatch({
      currentDirtyFields: context.canonicalArtist.sync?.dirtyFields,
      changedFields,
    });

    const updated = await CanonicalArtistModel.findOneAndUpdate(
      { _id: context.canonicalArtist._id, shopDomain: context.user.shopDomain, artistKey: context.user.artistKey },
      {
        $set: {
          displayName: parsed.data.displayName,
          handle: parsed.data.handle,
          locationCity: parsed.data.locationCity.trim() || undefined,
          locationCountry: parsed.data.locationCountry.trim() || undefined,
          bio: parsed.data.bio.trim() || undefined,
          publicProfile: {
            isVisible: parsed.data.publicProfileVisible !== false,
          },
          profileImages: {
            avatarUrl: avatarUrl || undefined,
            heroUrl: heroUrl || undefined,
            galleryUrls,
          },
          ...syncPatch,
        },
      },
      { new: true },
    ).lean();

    await UserModel.updateOne({ _id: context.user._id }, { $set: { name: parsed.data.displayName } });

    return NextResponse.json(
      {
        ok: true,
        profile: {
          artistKey: context.user.artistKey,
          email: context.user.email,
          displayName: updated?.displayName || "",
          handle: updated?.handle || context.user.artistKey,
          locationCity: updated?.locationCity || "",
          locationCountry: updated?.locationCountry || "",
          bio: updated?.bio || "",
          publicProfileVisible: updated?.publicProfile?.isVisible !== false,
          profileImages: {
            avatarUrl: updated?.profileImages?.avatarUrl || "",
            heroUrl: updated?.profileImages?.heroUrl || "",
            galleryUrls: Array.isArray(updated?.profileImages?.galleryUrls) ? updated.profileImages.galleryUrls : [],
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return artistApiErrorResponse(error, "profile_save_failed");
  }
}
