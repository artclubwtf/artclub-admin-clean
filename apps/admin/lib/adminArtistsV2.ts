import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { isMigrationModeEnabled, isShopifyWriteEnabled } from "@/lib/featureFlags";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { ArtistModel } from "@/models/Artist";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";
import { ContractModel } from "@/models/Contract";
import { PayoutDetailsModel } from "@/models/PayoutDetails";
import { PayoutTransactionModel } from "@/models/PayoutTransaction";
import { RequestModel } from "@/models/Request";
import { SyncStateModel } from "@/models/SyncState";
import { UserModel } from "@/models/User";

type LinkedUserSummary = {
  id: string;
  email: string;
  name: string;
  artistKey: string;
};

export type ArtistV2OverviewRow = {
  artistKey: string;
  displayName: string;
  publicSlug: string;
  email: string;
  canonicalStatus: string;
  migrationStatus: string;
  linkStatus: string;
  reviewStatus: string;
  linkedUser: LinkedUserSummary | null;
  syncStatus: {
    needsPush: boolean;
    lastPushAt: string | null;
    lastPullAt: string | null;
    lastError: string | null;
  };
  shopifyMetaobjectId: string;
  legacyArtistId: string;
  productCount: number;
  pendingReviewCount: number;
  publishedCount: number;
  printsEnabledCount: number;
  updatedAt: string | null;
};

export type ArtistV2ProductRow = {
  productKey: string;
  title: string;
  handle: string;
  status: string;
  approvalStatus: string;
  derivedStatus: "draft" | "pending_review" | "approved" | "published" | "archived";
  forSale: boolean;
  printsEnabled: boolean;
  originalAvailable: boolean;
  shopifyProductId: string;
  legacyProductId: string;
  migrationStatus: string;
  needsPush: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string;
  variantCount: number;
  publishedVariantCount: number;
  updatedAt: string | null;
};

export type ArtistV2Detail = {
  artist: {
    artistKey: string;
    displayName: string;
    handle: string;
    publicSlug: string;
    appUrl: string;
    email: string;
    bio: string;
    locationCity: string;
    locationCountry: string;
    websiteUrl: string;
    instagram: string;
    publicVisible: boolean;
    migrationStatus: string;
    linkStatus: string;
    shopifyMetaobjectId: string;
    legacyArtistId: string;
    linkedUser: LinkedUserSummary | null;
    syncStatus: {
      needsPush: boolean;
      lastPushAt: string | null;
      lastPullAt: string | null;
      lastError: string | null;
      dirtyFields: string[];
    };
  };
  products: ArtistV2ProductRow[];
  requests: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string | null;
    reviewerNote: string;
  }>;
  contracts: Array<{
    id: string;
    contractType: string;
    filename: string;
    signedAt: string | null;
    createdAt: string | null;
    s3Url: string;
  }>;
  payout: {
    details: {
      accountHolder: string;
      iban: string;
      bankName: string;
      taxId: string;
    } | null;
    transactions: Array<{
      id: string;
      amount: number;
      currency: string;
      method: string;
      createdAt: string | null;
      note: string;
    }>;
  };
  applications: Array<{
    id: string;
    status: string;
    submittedAt: string | null;
    email: string;
    fullName: string;
    shopifyMetaobjectId: string;
  }>;
  legacy: {
    artist: null | {
      id: string;
      name: string;
      email: string;
      stage: string;
      shopifyMetaobjectId: string;
      handle: string;
      updatedAt: string | null;
    };
  };
  bridge: {
    legacyArtistId: string;
    oldAdminHref: string | null;
    requestsHref: string | null;
    applicationsHref: string;
    messagesAvailable: boolean;
  };
};

export type ArtistV2Meta = {
  flags: {
    migrationMode: boolean;
    shopifyWriteEnabled: boolean;
  };
  activity: {
    lastImportAt: string | null;
    lastSyncAt: string | null;
  };
  review: {
    openItems: number;
    artistMatches: number;
    productAssignments: number;
    unlinkedAccounts: number;
    syncReady: number;
  };
};

export type ArtistV2SyncQueueRow = {
  kind: "artist" | "product";
  key: string;
  title: string;
  artistKey: string;
  artistLabel: string;
  destination: string;
  operation: "create" | "update";
  status: "open" | "completed" | "error";
  shopifyId: string;
  approvalStatus: string;
  needsPush: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
};

function optionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(status: string | null | undefined) {
  return optionalString(status).trim() || "unlinked";
}

function deriveCanonicalArtistStatus(input: { migrationStatus?: string | null; linkStatus?: string | null; needsPush?: boolean }) {
  if (input.linkStatus === "linked") return "linked";
  if (input.linkStatus === "needs_review" || input.migrationStatus === "needs_review") return "needs_review";
  if (input.migrationStatus?.startsWith("imported")) return input.migrationStatus;
  if (input.needsPush) return "linked";
  return input.linkStatus || input.migrationStatus || "unlinked";
}

function deriveProductReviewStatus(input: { status?: string | null; approvalStatus?: string | null; migrationStatus?: string | null }) {
  if (input.status === "archived" || input.approvalStatus === "archived") return "archived";
  if (input.approvalStatus === "published" || input.status === "active") return "published";
  if (input.approvalStatus === "approved") return "approved";
  if (input.approvalStatus === "needs_review" || input.migrationStatus === "imported_unmapped") return "pending_review";
  return "draft";
}

function isObjectIdString(value: string | null | undefined): value is string {
  return Boolean(value && Types.ObjectId.isValid(value));
}

function deriveSyncQueueStatus(input: { needsPush?: boolean | null; lastError?: string | null; lastPushAt?: Date | string | null }) {
  if (optionalString(input.lastError)) return "error" as const;
  if (input.needsPush) return "open" as const;
  if (input.lastPushAt) return "completed" as const;
  return "completed" as const;
}

export async function loadAdminArtistsV2Meta() {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) throw new Error("Missing shop domain");

  await connectMongo();

  const [artistMatches, productAssignments, unlinkedAccounts, syncReady, syncStates] = await Promise.all([
    CanonicalArtistModel.countDocuments({
      shopDomain,
      $or: [{ migrationStatus: "imported_unlinked" }, { linkStatus: { $in: ["unlinked", "suggested", "needs_review"] } }],
    }),
    CanonicalProductModel.countDocuments({
      shopDomain,
      migrationStatus: { $in: ["imported_unmapped", "suggested", "unassigned", "needs_review"] },
    }),
    CanonicalArtistModel.countDocuments({
      shopDomain,
      $or: [{ linkedUserId: { $exists: false } }, { linkedUserId: null }],
    }),
    CanonicalProductModel.countDocuments({
      shopDomain,
      "sync.needsPush": true,
      approvalStatus: { $in: ["approved", "published"] },
    }),
    SyncStateModel.find({
      shopDomain,
      scope: { $in: ["shopify_import_artists", "shopify_import_products", "legacy_import", "shopify_push"] },
    })
      .select({ scope: 1, lastSuccessAt: 1, lastRunAt: 1 })
      .lean(),
  ]);

  const importTimes = syncStates
    .filter((state) => state.scope !== "shopify_push")
    .map((state) => state.lastSuccessAt || state.lastRunAt)
    .filter(Boolean);
  const pushTimes = syncStates
    .filter((state) => state.scope === "shopify_push")
    .map((state) => state.lastSuccessAt || state.lastRunAt)
    .filter(Boolean);

  return {
    flags: {
      migrationMode: isMigrationModeEnabled(),
      shopifyWriteEnabled: isShopifyWriteEnabled(),
    },
    activity: {
      lastImportAt: importTimes.length ? toIsoString(importTimes.sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0]) : null,
      lastSyncAt: pushTimes.length ? toIsoString(pushTimes.sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0]) : null,
    },
    review: {
      openItems: artistMatches + productAssignments + unlinkedAccounts,
      artistMatches,
      productAssignments,
      unlinkedAccounts,
      syncReady,
    },
  } satisfies ArtistV2Meta;
}

export async function loadAdminArtistsV2Overview() {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) throw new Error("Missing shop domain");

  await connectMongo();

  const [artists, users, products] = await Promise.all([
    CanonicalArtistModel.find({ shopDomain }).sort({ updatedAt: -1, createdAt: -1 }).lean(),
    UserModel.find({ shopDomain, role: "artist" })
      .select({ _id: 1, email: 1, name: 1, artistKey: 1 })
      .lean(),
    CanonicalProductModel.find({ shopDomain })
      .select({
        artistKey: 1,
        status: 1,
        approvalStatus: 1,
        migrationStatus: 1,
        allowPrints: 1,
      })
      .lean(),
  ]);

  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const fallbackUserByArtistKey = new Map(
    users.filter((user) => user.artistKey).map((user) => [optionalString(user.artistKey), user]),
  );
  const productsByArtistKey = products.reduce<Record<string, typeof products>>((acc, product) => {
    const key = optionalString(product.artistKey);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(product);
    return acc;
  }, {});

  return artists.map((artist) => {
    const linkedUserDoc =
      (artist.linkedUserId ? userById.get(artist.linkedUserId.toString()) : null) ||
      fallbackUserByArtistKey.get(optionalString(artist.artistKey)) ||
      null;
    const linkedUser = linkedUserDoc
      ? {
          id: linkedUserDoc._id.toString(),
          email: optionalString(linkedUserDoc.email),
          name: optionalString(linkedUserDoc.name),
          artistKey: optionalString(linkedUserDoc.artistKey),
        }
      : null;
    const artistProducts = productsByArtistKey[artist.artistKey] || [];
    const pendingReviewCount = artistProducts.filter((product) => deriveProductReviewStatus(product) === "pending_review").length;
    const publishedCount = artistProducts.filter((product) => deriveProductReviewStatus(product) === "published").length;
    const printsEnabledCount = artistProducts.filter((product) => Boolean(product.allowPrints)).length;

    return {
      artistKey: artist.artistKey,
      displayName: optionalString(artist.displayName) || optionalString(artist.handle) || artist.artistKey,
      publicSlug: optionalString(artist.publicSlug) || optionalString(artist.handle),
      email: optionalString(artist.email),
      canonicalStatus: deriveCanonicalArtistStatus({
        migrationStatus: artist.migrationStatus,
        linkStatus: artist.linkStatus,
        needsPush: Boolean(artist.sync?.needsPush),
      }),
      migrationStatus: normalizeStatus(artist.migrationStatus),
      linkStatus: normalizeStatus(artist.linkStatus),
      reviewStatus: pendingReviewCount > 0 ? "needs_review" : publishedCount > 0 ? "approved" : "draft",
      linkedUser,
      syncStatus: {
        needsPush: Boolean(artist.sync?.needsPush),
        lastPushAt: toIsoString(artist.sync?.lastPushAt),
        lastPullAt: toIsoString(artist.sync?.lastPullAt),
        lastError: artist.sync?.lastError || null,
      },
      shopifyMetaobjectId: optionalString(artist.shopifyMetaobjectId) || optionalString(artist.shopify?.metaobjectGid),
      legacyArtistId: optionalString(artist.legacyArtistId),
      productCount: artistProducts.length,
      pendingReviewCount,
      publishedCount,
      printsEnabledCount,
      updatedAt: toIsoString(artist.updatedAt),
    } satisfies ArtistV2OverviewRow;
  });
}

export async function loadAdminArtistsV2SyncQueue() {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) throw new Error("Missing shop domain");

  await connectMongo();

  const [artistsNeedingSync, productsNeedingSync] = await Promise.all([
    CanonicalArtistModel.find({
      shopDomain,
      $or: [{ "sync.needsPush": true }, { "sync.lastError": { $exists: true, $ne: null } }, { "sync.lastPushAt": { $exists: true, $ne: null } }],
    })
      .select({
        artistKey: 1,
        displayName: 1,
        publicSlug: 1,
        handle: 1,
        shopifyMetaobjectId: 1,
        shopify: 1,
        sync: 1,
      })
      .sort({ "sync.lastError": -1, "sync.needsPush": -1, updatedAt: -1 })
      .lean(),
    CanonicalProductModel.find({
      shopDomain,
      type: "artwork",
      $or: [{ "sync.needsPush": true }, { "sync.lastError": { $exists: true, $ne: null } }, { "sync.lastPushAt": { $exists: true, $ne: null } }],
    })
      .select({
        productKey: 1,
        title: 1,
        artistKey: 1,
        shopifyProductId: 1,
        shopify: 1,
        approvalStatus: 1,
        sync: 1,
      })
      .sort({ "sync.lastError": -1, "sync.needsPush": -1, updatedAt: -1 })
      .lean(),
  ]);

  const artistKeys = Array.from(new Set(productsNeedingSync.map((product) => optionalString(product.artistKey)).filter(Boolean)));
  const productArtists = artistKeys.length
    ? await CanonicalArtistModel.find({ shopDomain, artistKey: { $in: artistKeys } })
        .select({ artistKey: 1, displayName: 1, publicSlug: 1, handle: 1 })
        .lean()
    : [];
  const artistByKey = new Map(
    productArtists.map((artist) => [
      artist.artistKey,
      optionalString(artist.displayName) || optionalString(artist.publicSlug) || optionalString(artist.handle) || artist.artistKey,
    ]),
  );

  const artistRows = artistsNeedingSync.map((artist) => ({
    kind: "artist",
    key: artist.artistKey,
    title: optionalString(artist.displayName) || optionalString(artist.publicSlug) || optionalString(artist.handle) || artist.artistKey,
    artistKey: artist.artistKey,
    artistLabel: optionalString(artist.displayName) || optionalString(artist.publicSlug) || optionalString(artist.handle) || artist.artistKey,
    destination: "Shopify metaobject `kunstler`",
    operation: optionalString(artist.shopifyMetaobjectId) || optionalString(artist.shopify?.metaobjectGid) ? "update" : "create",
    status: deriveSyncQueueStatus({
      needsPush: artist.sync?.needsPush,
      lastError: artist.sync?.lastError,
      lastPushAt: artist.sync?.lastPushAt,
    }),
    shopifyId: optionalString(artist.shopifyMetaobjectId) || optionalString(artist.shopify?.metaobjectGid),
    approvalStatus: "approved",
    needsPush: Boolean(artist.sync?.needsPush),
    lastPushAt: toIsoString(artist.sync?.lastPushAt),
    lastPullAt: toIsoString(artist.sync?.lastPullAt),
    lastError: optionalString(artist.sync?.lastError) || null,
  })) satisfies ArtistV2SyncQueueRow[];

  const productRows = productsNeedingSync.map((product) => ({
    kind: "product",
    key: product.productKey,
    title: optionalString(product.title) || product.productKey,
    artistKey: optionalString(product.artistKey),
    artistLabel: artistByKey.get(optionalString(product.artistKey)) || optionalString(product.artistKey) || "Unassigned artist",
    destination: "Shopify product",
    operation: optionalString(product.shopifyProductId) || optionalString(product.shopify?.productGid) ? "update" : "create",
    status: deriveSyncQueueStatus({
      needsPush: product.sync?.needsPush,
      lastError: product.sync?.lastError,
      lastPushAt: product.sync?.lastPushAt,
    }),
    shopifyId: optionalString(product.shopifyProductId) || optionalString(product.shopify?.productGid),
    approvalStatus: normalizeStatus(product.approvalStatus),
    needsPush: Boolean(product.sync?.needsPush),
    lastPushAt: toIsoString(product.sync?.lastPushAt),
    lastPullAt: toIsoString(product.sync?.lastPullAt),
    lastError: optionalString(product.sync?.lastError) || null,
  })) satisfies ArtistV2SyncQueueRow[];

  return [...artistRows, ...productRows];
}

export async function loadAdminArtistV2Detail(artistKey: string) {
  const shopDomain = resolveShopDomain();
  if (!shopDomain) throw new Error("Missing shop domain");

  await connectMongo();

  const artist = await CanonicalArtistModel.findOne({ shopDomain, artistKey }).lean();
  if (!artist) return null;

  const linkedUserDoc =
    (artist.linkedUserId
      ? await UserModel.findOne({ _id: artist.linkedUserId, shopDomain })
          .select({ _id: 1, email: 1, name: 1, artistKey: 1, artistId: 1 })
          .lean()
      : null) ||
    (await UserModel.findOne({ shopDomain, role: "artist", artistKey })
      .select({ _id: 1, email: 1, name: 1, artistKey: 1, artistId: 1 })
      .lean());

  const linkedUser = linkedUserDoc
    ? {
        id: linkedUserDoc._id.toString(),
        email: optionalString(linkedUserDoc.email),
        name: optionalString(linkedUserDoc.name),
        artistKey: optionalString(linkedUserDoc.artistKey),
      }
    : null;

  const legacyArtistId = optionalString(artist.legacyArtistId) || optionalString(linkedUserDoc?.artistId?.toString());
  const legacyArtistObjectId = isObjectIdString(legacyArtistId) ? new Types.ObjectId(legacyArtistId) : null;
  const applicationConditions = [
    ...(linkedUserDoc ? [{ linkedUserId: linkedUserDoc._id }] : []),
    ...(legacyArtistObjectId ? [{ linkedArtistId: legacyArtistObjectId }] : []),
    ...(artist.email ? [{ "personal.email": artist.email }] : []),
  ];

  const [products, legacyArtist, requests, contracts, payoutDetails, payoutTransactions, applications] = await Promise.all([
    CanonicalProductModel.find({ shopDomain, artistKey }).sort({ updatedAt: -1, createdAt: -1 }).lean(),
    legacyArtistObjectId ? ArtistModel.findById(legacyArtistObjectId).lean() : null,
    legacyArtistObjectId
      ? RequestModel.find({ artistId: legacyArtistObjectId }).sort({ createdAt: -1 }).limit(10).lean()
      : [],
    legacyArtistId ? ContractModel.find({ kunstlerId: legacyArtistId }).sort({ createdAt: -1 }).limit(10).lean() : [],
    legacyArtistId ? PayoutDetailsModel.findOne({ kunstlerId: legacyArtistId }).lean() : null,
    legacyArtistId ? PayoutTransactionModel.find({ artistMongoId: legacyArtistId }).sort({ createdAt: -1 }).limit(10).lean() : [],
    applicationConditions.length
      ? ArtistApplicationModel.find({
          $or: applicationConditions,
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      : [],
  ]);

  const productKeys = products.map((product) => product.productKey);
  const variants = productKeys.length
    ? await CanonicalVariantModel.find({ shopDomain, productKey: { $in: productKeys } })
        .select({ productKey: 1, published: 1 })
        .lean()
    : [];

  const variantsByProductKey = variants.reduce<Record<string, { total: number; published: number }>>((acc, variant) => {
    if (!acc[variant.productKey]) acc[variant.productKey] = { total: 0, published: 0 };
    acc[variant.productKey].total += 1;
    if (variant.published) acc[variant.productKey].published += 1;
    return acc;
  }, {});

  return {
    artist: {
      artistKey: artist.artistKey,
      displayName: optionalString(artist.displayName),
      handle: optionalString(artist.handle),
      publicSlug: optionalString(artist.publicSlug),
      appUrl: optionalString(artist.appUrl),
      email: optionalString(artist.email),
      bio: optionalString(artist.bio),
      locationCity: optionalString(artist.locationCity),
      locationCountry: optionalString(artist.locationCountry),
      websiteUrl: optionalString(artist.websiteUrl),
      instagram: optionalString(artist.instagram),
      publicVisible: artist.publicProfile?.isVisible !== false,
      migrationStatus: normalizeStatus(artist.migrationStatus),
      linkStatus: normalizeStatus(artist.linkStatus),
      shopifyMetaobjectId: optionalString(artist.shopifyMetaobjectId) || optionalString(artist.shopify?.metaobjectGid),
      legacyArtistId,
      linkedUser,
      syncStatus: {
        needsPush: Boolean(artist.sync?.needsPush),
        lastPushAt: toIsoString(artist.sync?.lastPushAt),
        lastPullAt: toIsoString(artist.sync?.lastPullAt),
        lastError: artist.sync?.lastError || null,
        dirtyFields: Array.isArray(artist.sync?.dirtyFields) ? artist.sync.dirtyFields : [],
      },
    },
    products: products.map((product) => {
      const variantSummary = variantsByProductKey[product.productKey] || { total: 0, published: 0 };
      return {
        productKey: product.productKey,
        title: optionalString(product.title),
        handle: optionalString(product.handle),
        status: optionalString(product.status) || "draft",
        approvalStatus: optionalString(product.approvalStatus) || "draft",
        derivedStatus: deriveProductReviewStatus(product),
        forSale: Boolean(product.forSale),
        printsEnabled: Boolean(product.allowPrints),
        originalAvailable: Boolean(product.originalAvailable),
        shopifyProductId: optionalString(product.shopifyProductId) || optionalString(product.shopify?.productGid),
        legacyProductId: optionalString(product.legacyProductId),
        migrationStatus: optionalString(product.migrationStatus),
        needsPush: Boolean(product.sync?.needsPush),
        lastPushAt: toIsoString(product.sync?.lastPushAt),
        lastPullAt: toIsoString(product.sync?.lastPullAt),
        lastError: optionalString(product.sync?.lastError),
        variantCount: variantSummary.total,
        publishedVariantCount: variantSummary.published,
        updatedAt: toIsoString(product.updatedAt),
      } satisfies ArtistV2ProductRow;
    }),
    requests: requests.map((request) => ({
      id: request._id.toString(),
      type: request.type,
      status: request.status,
      createdAt: toIsoString(request.createdAt),
      reviewerNote: optionalString(request.reviewerNote),
    })),
    contracts: contracts.map((contract) => ({
      id: contract._id.toString(),
      contractType: contract.contractType,
      filename: optionalString(contract.filename),
      signedAt: toIsoString(contract.signedAt),
      createdAt: toIsoString(contract.createdAt),
      s3Url: optionalString(contract.s3Url),
    })),
    payout: {
      details: payoutDetails
        ? {
            accountHolder: optionalString(payoutDetails.accountHolder),
            iban: optionalString(payoutDetails.iban),
            bankName: optionalString(payoutDetails.bankName),
            taxId: optionalString(payoutDetails.taxId),
          }
        : null,
      transactions: payoutTransactions.map((transaction) => ({
        id: transaction._id.toString(),
        amount: Number(transaction.amount || 0),
        currency: optionalString(transaction.currency) || "EUR",
        method: optionalString(transaction.method),
        createdAt: toIsoString(transaction.createdAt),
        note: optionalString(transaction.note),
      })),
    },
    applications: applications.map((application) => ({
      id: application._id.toString(),
      status: application.status,
      submittedAt: toIsoString(application.submittedAt || application.createdAt),
      email: optionalString(application.personal?.email),
      fullName: optionalString(application.personal?.fullName),
      shopifyMetaobjectId: optionalString(application.shopifyMetaobjectId),
    })),
    legacy: {
      artist: legacyArtist
        ? {
            id: legacyArtist._id.toString(),
            name: optionalString(legacyArtist.name),
            email: optionalString(legacyArtist.email),
            stage: optionalString(legacyArtist.stage),
            shopifyMetaobjectId: optionalString(legacyArtist.shopifySync?.metaobjectId),
            handle: optionalString(legacyArtist.shopifySync?.handle),
            updatedAt: toIsoString(legacyArtist.updatedAt),
          }
        : null,
    },
    bridge: {
      legacyArtistId,
      oldAdminHref: legacyArtistId ? `/admin/artists/${encodeURIComponent(legacyArtistId)}` : null,
      requestsHref: legacyArtistId ? `/admin/requests?artistId=${encodeURIComponent(legacyArtistId)}` : null,
      applicationsHref: "/admin/applications",
      messagesAvailable: Boolean(legacyArtistId),
    },
  } satisfies ArtistV2Detail;
}
