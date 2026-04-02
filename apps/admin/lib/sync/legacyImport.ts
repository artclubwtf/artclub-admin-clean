import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export async function importLegacyArtistsToCanonical(input: {
  shopDomain: string;
  limit?: number;
}) {
  await connectMongo();

  const legacyArtists = await ArtistModel.find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(input.limit || 0)
    .lean();

  const legacyIds = legacyArtists.map((artist) => artist._id);
  const linkedUsers = await UserModel.find({
    shopDomain: input.shopDomain,
    role: "artist",
    artistId: { $in: legacyIds },
  })
    .select({ _id: 1, artistId: 1, artistKey: 1 })
    .lean();

  const userByLegacyArtistId = new Map(
    linkedUsers
      .filter((user) => user.artistId)
      .map((user) => [user.artistId!.toString(), user]),
  );

  let importedCount = 0;
  let linkedCount = 0;

  for (const legacyArtist of legacyArtists) {
    const legacyArtistId = legacyArtist._id.toString();
    const linkedUser = userByLegacyArtistId.get(legacyArtistId) || null;
    const lookupArtistKey = firstNonEmpty(linkedUser?.artistKey, `legacy_${legacyArtistId}`);
    const existing =
      (await CanonicalArtistModel.findOne({
        shopDomain: input.shopDomain,
        $or: [{ legacyArtistId }, { artistKey: lookupArtistKey }],
      }).lean()) || null;
    const artistKey = firstNonEmpty(linkedUser?.artistKey, existing?.artistKey, `legacy_${legacyArtistId}`);
    const handle =
      firstNonEmpty(
        existing?.handle,
        legacyArtist.shopifySync?.handle,
        linkedUser?.artistKey,
        slugify(legacyArtist.publicProfile?.displayName || legacyArtist.publicProfile?.name || legacyArtist.name),
      ) || artistKey;
    const publicSlug = firstNonEmpty(existing?.publicSlug, linkedUser?.artistKey, `legacy-${legacyArtistId}`);
    const displayName =
      firstNonEmpty(legacyArtist.publicProfile?.displayName, legacyArtist.publicProfile?.name, legacyArtist.name) || artistKey;

    await CanonicalArtistModel.findOneAndUpdate(
      {
        shopDomain: input.shopDomain,
        artistKey: existing?.artistKey || artistKey,
      },
      {
        $set: {
          handle,
          publicSlug: existing?.publicSlug || publicSlug,
          displayName,
          email: firstNonEmpty(existing?.email, legacyArtist.email),
          locationCity: firstNonEmpty(existing?.locationCity),
          locationCountry: firstNonEmpty(existing?.locationCountry),
          bio: firstNonEmpty(existing?.bio, legacyArtist.publicProfile?.bio),
          websiteUrl: firstNonEmpty(existing?.websiteUrl, legacyArtist.publicProfile?.website),
          instagram: firstNonEmpty(existing?.instagram, legacyArtist.publicProfile?.instagram),
          shopifyMetaobjectId: firstNonEmpty(existing?.shopifyMetaobjectId, legacyArtist.shopifySync?.metaobjectId),
          legacyArtistId,
          migrationStatus: existing?.migrationStatus || "needs_review",
          linkStatus: linkedUser ? "linked" : existing?.linkStatus || "needs_review",
          linkedUserId: linkedUser?._id || existing?.linkedUserId || null,
          profileImages: {
            avatarUrl: firstNonEmpty(existing?.profileImages?.avatarUrl, legacyArtist.publicProfile?.bilder),
            heroUrl: firstNonEmpty(existing?.profileImages?.heroUrl, legacyArtist.publicProfile?.heroImageUrl),
            galleryUrls:
              existing?.profileImages?.galleryUrls?.length
                ? existing.profileImages.galleryUrls
                : [
                    legacyArtist.publicProfile?.bild_1,
                    legacyArtist.publicProfile?.bild_2,
                    legacyArtist.publicProfile?.bild_3,
                  ].filter((value): value is string => Boolean((value || "").trim())),
          },
          publicProfile: {
            isVisible: existing?.publicProfile?.isVisible ?? true,
          },
        },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    importedCount += 1;
    if (linkedUser) linkedCount += 1;
  }

  return {
    importedCount,
    linkedCount,
  };
}
