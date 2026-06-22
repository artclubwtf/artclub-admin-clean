import { randomBytes } from "crypto";

import { hash } from "bcryptjs";
import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { ArtworkModel } from "@/models/Artwork";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { UserModel } from "@/models/User";

function slugify(value: string | null | undefined) {
  return (value || "")
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

function buildProvisionEmail(slug: string) {
  const prefix = (process.env.ARTIST_PROVISION_EMAIL_PREFIX || "support").trim() || "support";
  const domain = (process.env.ARTIST_PROVISION_EMAIL_DOMAIN || "artclub.wtf").trim() || "artclub.wtf";
  return `${prefix}+${slug}@${domain}`.toLowerCase();
}

function buildTemporaryPassword() {
  return `artclub-${randomBytes(12).toString("base64url")}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ artistKey: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { artistKey: rawArtistKey } = await params;
  const artistKey = rawArtistKey?.trim();
  if (!artistKey) {
    return NextResponse.json({ ok: false, error: "invalid_artist_key" }, { status: 400 });
  }

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
  }

  await connectMongo();

  const artist = await CanonicalArtistModel.findOne({ shopDomain, artistKey }).lean();
  if (!artist) {
    return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404 });
  }

  if (artist.linkedUserId) {
    return NextResponse.json({ ok: false, error: "artist_already_linked" }, { status: 409 });
  }

  const existingArtistUser = await UserModel.findOne({ shopDomain, role: "artist", artistKey })
    .select({ _id: 1 })
    .lean();
  if (existingArtistUser) {
    return NextResponse.json({ ok: false, error: "artist_key_already_used_by_other_account" }, { status: 409 });
  }

  const normalizedArtistSlug =
    firstNonEmpty(
      slugify(artist.publicSlug),
      slugify(artist.handle),
      slugify(artist.displayName),
      slugify(artist.artistKey),
    ) || `artist-${artistKey.toLowerCase()}`;

  const email = buildProvisionEmail(normalizedArtistSlug);
  const existingEmailUser = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
  if (existingEmailUser) {
    return NextResponse.json({ ok: false, error: "email_already_used_by_existing_account", email }, { status: 409 });
  }

  const legacyArtistObjectId =
    artist.legacyArtistId && Types.ObjectId.isValid(artist.legacyArtistId) ? new Types.ObjectId(artist.legacyArtistId) : undefined;

  const temporaryPassword = buildTemporaryPassword();
  const passwordHash = await hash(temporaryPassword, 12);
  const onboardingComplete = Boolean(
    artist.displayName?.trim() &&
      (artist.bio?.trim() || artist.locationCity?.trim() || artist.locationCountry?.trim() || artist.profileImages?.avatarUrl),
  );

  const user = await UserModel.create({
    email,
    role: "artist",
    name: firstNonEmpty(artist.displayName, artist.handle, artist.artistKey),
    shopDomain,
    artistKey,
    ...(legacyArtistObjectId ? { artistId: legacyArtistObjectId } : {}),
    accountSource: "admin_provisioned",
    onboardingComplete,
    passwordHash,
    mustChangePassword: true,
    isActive: true,
  });

  const linked = await CanonicalArtistModel.updateOne(
    {
      shopDomain,
      artistKey,
      $or: [{ linkedUserId: { $exists: false } }, { linkedUserId: null }],
    },
    {
      $set: {
        linkedUserId: user._id,
        accountStatus: "provisioned",
        linkStatus: "linked",
      },
    },
  );

  if (linked.modifiedCount !== 1) {
    await UserModel.deleteOne({ _id: user._id }).catch(() => null);
    return NextResponse.json({ ok: false, error: "artist_already_linked" }, { status: 409 });
  }

  const artistRefs = Array.from(
    new Set([artist.shopifyMetaobjectId, artist.shopify?.metaobjectGid].map((value) => (value || "").trim()).filter(Boolean)),
  );
  const hardOwnershipConditions: Array<Record<string, unknown>> = [{ artistKey: artist.artistKey }];
  if (artistRefs.length) hardOwnershipConditions.push({ artistRef: { $in: artistRefs } });

  if (legacyArtistObjectId) {
    const legacyArtworkIds = await ArtworkModel.find({ artistId: legacyArtistObjectId }).select({ _id: 1 }).lean();
    const legacyProductIds = legacyArtworkIds.map((item) => item._id.toString());
    if (legacyProductIds.length) hardOwnershipConditions.push({ legacyProductId: { $in: legacyProductIds } });
  }

  const assignableFilter = {
    shopDomain,
    $and: [
      { $or: hardOwnershipConditions },
      {
        $or: [
          { canonicalArtistId: { $exists: false } },
          { canonicalArtistId: null },
          { canonicalArtistId: artist._id },
        ],
      },
    ],
  };
  const autoAssignedCount = await CanonicalProductModel.countDocuments(assignableFilter);

  if (autoAssignedCount > 0) {
    await CanonicalProductModel.updateMany(assignableFilter, {
      $set: {
        canonicalArtistId: artist._id,
        artistKey: artist.artistKey,
        ...(artistRefs[0] ? { artistRef: artistRefs[0] } : {}),
        assignmentStatus: "confirmed",
        migrationStatus: "assigned",
      },
    });
  }

  const reviewVendorHints = Array.from(
    new Set([artist.displayName, artist.handle, artist.publicSlug].map((value) => (value || "").trim()).filter(Boolean)),
  );
  const reviewFilter = {
    shopDomain,
    vendor: { $in: reviewVendorHints },
    $or: [{ canonicalArtistId: { $exists: false } }, { canonicalArtistId: null }],
  };
  const reviewCount = reviewVendorHints.length ? await CanonicalProductModel.countDocuments(reviewFilter) : 0;
  if (reviewCount > 0) {
    await CanonicalProductModel.updateMany(reviewFilter, {
      $set: {
        assignmentStatus: "needs_review",
        migrationStatus: "needs_review",
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        artistKey: user.artistKey,
        mustChangePassword: user.mustChangePassword,
        onboardingComplete: user.onboardingComplete === true,
        accountSource: user.accountSource,
      },
      artist: {
        artistKey,
        linkedUserId: user._id.toString(),
        accountStatus: "provisioned",
      },
      productAssignment: {
        autoAssignedCount,
        reviewCount,
      },
      bootstrap: {
        initialPassword: temporaryPassword,
        mode: "temporary_password",
        warning: "Transitional preprovisioned account. Password must be changed on first login.",
      },
    },
    { status: 201 },
  );
}
