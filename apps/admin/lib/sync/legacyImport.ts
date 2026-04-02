import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ApplicationArtworkModel } from "@/models/ApplicationArtwork";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { ArtistModel } from "@/models/Artist";
import { ArtworkModel } from "@/models/Artwork";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel, type CanonicalProductOffering } from "@/models/CanonicalProduct";
import { ContractModel } from "@/models/Contract";
import { MediaModel } from "@/models/Media";
import { MessageModel } from "@/models/Message";
import { MessageThreadModel } from "@/models/MessageThread";
import { PayoutDetailsModel } from "@/models/PayoutDetails";
import { PayoutTransactionModel } from "@/models/PayoutTransaction";
import { RequestModel } from "@/models/Request";
import { UserModel } from "@/models/User";

type LegacyArtistBridge = {
  artistKey: string;
  shopifyMetaobjectId: string;
};

export type LegacyImportSummary = {
  artists: {
    processedCount: number;
    upsertedCount: number;
    linkedCount: number;
    conflictCount: number;
  };
  products: {
    processedCount: number;
    upsertedCount: number;
    artworkCount: number;
    applicationArtworkCount: number;
    conflictCount: number;
  };
  referenced: {
    requests: number;
    legacyMessages: number;
    contracts: number;
    payoutDetails: number;
    payoutTransactions: number;
    applications: number;
  };
  classifications: {
    migrated: string[];
    referenced: string[];
    readOnly: string[];
  };
};

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

function offeringFromLegacySaleType(saleType: string | null | undefined): CanonicalProductOffering {
  switch ((saleType || "").trim()) {
    case "original":
      return "original_only";
    case "print":
      return "prints_only";
    default:
      return "original_plus_prints";
  }
}

function offeringFromApplicationArtwork(offering: string | null | undefined): CanonicalProductOffering {
  return offering === "print_only" ? "prints_only" : "original_plus_prints";
}

async function syncLegacyArtists(input: { shopDomain: string; limit?: number }) {
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

  const bridgeByLegacyArtistId = new Map<string, LegacyArtistBridge>();
  let upsertedCount = 0;
  let linkedCount = 0;
  let conflictCount = 0;

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
    const shopifyMetaobjectId = firstNonEmpty(existing?.shopifyMetaobjectId, legacyArtist.shopifySync?.metaobjectId);

    if (existing?.legacyArtistId && existing.legacyArtistId !== legacyArtistId) {
      conflictCount += 1;
    }

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
          shopifyMetaobjectId,
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
      { upsert: true, setDefaultsOnInsert: true },
    );

    bridgeByLegacyArtistId.set(legacyArtistId, {
      artistKey: existing?.artistKey || artistKey,
      shopifyMetaobjectId,
    });
    upsertedCount += 1;
    if (linkedUser) linkedCount += 1;
  }

  return {
    bridgeByLegacyArtistId,
    summary: {
      processedCount: legacyArtists.length,
      upsertedCount,
      linkedCount,
      conflictCount,
    },
  };
}

async function syncLegacyProducts(input: {
  shopDomain: string;
  limit?: number;
  artistBridgeByLegacyArtistId: Map<string, LegacyArtistBridge>;
}) {
  const [legacyArtworks, applicationArtworks, applications] = await Promise.all([
    ArtworkModel.find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(input.limit || 0)
      .lean(),
    ApplicationArtworkModel.find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(input.limit || 0)
      .lean(),
    ArtistApplicationModel.find({})
      .select({ _id: 1, linkedArtistId: 1, linkedUserId: 1, personal: 1 })
      .lean(),
  ]);

  const appById = new Map(applications.map((application) => [application._id.toString(), application]));
  const applicationMediaIds = Array.from(
    new Set(
      applicationArtworks.flatMap((artwork) => (artwork.mediaIds || []).map((mediaId) => mediaId.toString())),
    ),
  );
  const applicationMediaDocs = applicationMediaIds.length
    ? await MediaModel.find({ _id: { $in: applicationMediaIds.map((id) => new Types.ObjectId(id)) } })
        .select({ _id: 1, url: 1, previewUrl: 1 })
        .lean()
    : [];
  const mediaById = new Map(applicationMediaDocs.map((media) => [media._id.toString(), media]));
  const appUserIds = Array.from(
    new Set(
      applications
        .map((application) => application.linkedUserId?.toString())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const linkedUsers = appUserIds.length
    ? await UserModel.find({ _id: { $in: appUserIds.map((id) => new Types.ObjectId(id)) } })
        .select({ _id: 1, artistKey: 1 })
        .lean()
    : [];
  const userArtistKeyByUserId = new Map(linkedUsers.map((user) => [user._id.toString(), firstNonEmpty(user.artistKey)]));

  let upsertedCount = 0;
  let conflictCount = 0;

  for (const artwork of legacyArtworks) {
    const legacyArtistId = artwork.artistId.toString();
    const artistBridge = input.artistBridgeByLegacyArtistId.get(legacyArtistId);
    if (!artistBridge) {
      conflictCount += 1;
      continue;
    }

    const legacyProductId = artwork._id.toString();
    const existing =
      (await CanonicalProductModel.findOne({
        shopDomain: input.shopDomain,
        $or: [
          { legacyProductId },
          ...(artwork.shopify?.productId ? [{ shopifyProductId: artwork.shopify.productId }] : []),
        ],
      }).lean()) || null;

    if (existing?.artistKey && existing.artistKey !== artistBridge.artistKey) {
      conflictCount += 1;
    }

    const productKey = firstNonEmpty(existing?.productKey, artwork.shopify?.productId, `legacy_artwork_${legacyProductId}`);
    const firstImage = artwork.images?.[0];

    await CanonicalProductModel.findOneAndUpdate(
      { shopDomain: input.shopDomain, productKey },
      {
        $set: {
          type: "artwork",
          title: firstNonEmpty(existing?.title, artwork.title, "Untitled artwork"),
          description: firstNonEmpty(existing?.description, artwork.description),
          artistKey: artistBridge.artistKey,
          artistRef: firstNonEmpty(existing?.artistRef, artistBridge.shopifyMetaobjectId),
          shopifyProductId: firstNonEmpty(existing?.shopifyProductId, artwork.shopify?.productId),
          legacyProductId,
          migrationStatus: existing?.migrationStatus || "needs_review",
          approvalStatus: existing?.approvalStatus || "needs_review",
          offerings: offeringFromLegacySaleType(artwork.saleType),
          forSale: typeof artwork.price === "number" ? artwork.price > 0 : true,
          allowPrints: artwork.saleType === "print" || artwork.saleType === "both",
          originalAvailable: artwork.saleType === "original" || artwork.saleType === "both",
          status: artwork.shopify?.productId ? "active" : "draft",
          shortText: firstNonEmpty(existing?.shortText, artwork.description),
          images: {
            thumbUrl: firstNonEmpty(existing?.images?.thumbUrl, firstImage?.url),
            mediumUrl: firstNonEmpty(existing?.images?.mediumUrl, firstImage?.url),
            originalUrl: firstNonEmpty(existing?.images?.originalUrl, firstImage?.url),
            galleryUrls:
              existing?.images?.galleryUrls?.length
                ? existing.images.galleryUrls
                : (artwork.images || []).map((image) => image.url).filter((value): value is string => Boolean((value || "").trim())),
          },
          sync: {
            ...(existing?.sync || {}),
            lastError: existing?.sync?.lastError || null,
          },
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    upsertedCount += 1;
  }

  for (const artwork of applicationArtworks) {
    const application = appById.get(artwork.applicationId.toString());
    if (!application) {
      conflictCount += 1;
      continue;
    }

    const legacyArtistId = application.linkedArtistId?.toString() || "";
    const artistBridge =
      (legacyArtistId ? input.artistBridgeByLegacyArtistId.get(legacyArtistId) : null) ||
      (() => {
        const userArtistKey = application.linkedUserId ? userArtistKeyByUserId.get(application.linkedUserId.toString()) : "";
        return userArtistKey ? { artistKey: userArtistKey, shopifyMetaobjectId: "" } : null;
      })();

    if (!artistBridge) {
      conflictCount += 1;
      continue;
    }

    const legacyProductId = `application_artwork:${artwork._id.toString()}`;
    const existing =
      (await CanonicalProductModel.findOne({
        shopDomain: input.shopDomain,
        $or: [
          { legacyProductId },
          ...(artwork.shopifyProductId ? [{ shopifyProductId: artwork.shopifyProductId }] : []),
        ],
      }).lean()) || null;

    if (existing?.artistKey && existing.artistKey !== artistBridge.artistKey) {
      conflictCount += 1;
    }

    const productKey = firstNonEmpty(existing?.productKey, artwork.shopifyProductId, `legacy_${legacyProductId}`);
    const galleryUrls = (artwork.mediaIds || [])
      .map((mediaId) => mediaById.get(mediaId.toString()))
      .map((media) => firstNonEmpty(media?.url, media?.previewUrl))
      .filter(Boolean);

    await CanonicalProductModel.findOneAndUpdate(
      { shopDomain: input.shopDomain, productKey },
      {
        $set: {
          type: "artwork",
          title: firstNonEmpty(existing?.title, artwork.title, "Untitled artwork"),
          description: firstNonEmpty(existing?.description, artwork.shortDescription),
          artistKey: artistBridge.artistKey,
          artistRef: firstNonEmpty(existing?.artistRef, artistBridge.shopifyMetaobjectId),
          shopifyProductId: firstNonEmpty(existing?.shopifyProductId, artwork.shopifyProductId),
          legacyProductId,
          migrationStatus: existing?.migrationStatus || "imported_unmapped",
          approvalStatus: existing?.approvalStatus || "needs_review",
          offerings: offeringFromApplicationArtwork(artwork.offering),
          forSale: artwork.offering === "original_plus_prints" ? Number(artwork.originalPriceEur || 0) > 0 : true,
          allowPrints: true,
          originalAvailable: artwork.offering === "original_plus_prints",
          status: artwork.shopifyProductId ? "active" : "draft",
          dimensions: {
            widthCm: artwork.widthCm,
            heightCm: artwork.heightCm,
          },
          shortText: firstNonEmpty(existing?.shortText, artwork.shortDescription),
          images: {
            thumbUrl: firstNonEmpty(existing?.images?.thumbUrl, galleryUrls[0]),
            mediumUrl: firstNonEmpty(existing?.images?.mediumUrl, galleryUrls[0]),
            originalUrl: firstNonEmpty(existing?.images?.originalUrl, galleryUrls[0]),
            galleryUrls: existing?.images?.galleryUrls?.length ? existing.images.galleryUrls : galleryUrls,
          },
          sync: {
            ...(existing?.sync || {}),
            lastError: existing?.sync?.lastError || null,
          },
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    upsertedCount += 1;
  }

  return {
    processedCount: legacyArtworks.length + applicationArtworks.length,
    upsertedCount,
    artworkCount: legacyArtworks.length,
    applicationArtworkCount: applicationArtworks.length,
    conflictCount,
  };
}

async function loadLegacyReferenceCounts() {
  const [requests, messageThreads, messages, contracts, payoutDetails, payoutTransactions, applications] = await Promise.all([
    RequestModel.countDocuments({}),
    MessageThreadModel.countDocuments({}),
    MessageModel.countDocuments({}),
    ContractModel.countDocuments({}),
    PayoutDetailsModel.countDocuments({}),
    PayoutTransactionModel.countDocuments({}),
    ArtistApplicationModel.countDocuments({}),
  ]);

  return {
    requests,
    legacyMessages: messageThreads + messages,
    contracts,
    payoutDetails,
    payoutTransactions,
    applications,
  };
}

export async function importLegacyDataToCanonical(input: {
  shopDomain: string;
  limit?: number;
}) {
  await connectMongo();

  const artistResult = await syncLegacyArtists(input);
  const productResult = await syncLegacyProducts({
    shopDomain: input.shopDomain,
    limit: input.limit,
    artistBridgeByLegacyArtistId: artistResult.bridgeByLegacyArtistId,
  });
  const referenced = await loadLegacyReferenceCounts();

  return {
    artists: artistResult.summary,
    products: productResult,
    referenced,
    classifications: {
      migrated: ["Artist -> CanonicalArtist", "Artwork -> CanonicalProduct", "ApplicationArtwork -> CanonicalProduct"],
      referenced: ["Request", "Contract", "PayoutDetails", "PayoutTransaction", "ArtistApplication"],
      readOnly: ["MessageThread", "Message"],
    },
  } satisfies LegacyImportSummary;
}

export async function importLegacyArtistsToCanonical(input: {
  shopDomain: string;
  limit?: number;
}) {
  const result = await syncLegacyArtists(input);
  return result.summary;
}
