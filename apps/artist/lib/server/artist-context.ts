import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/server/auth";
import { ensureCanonicalArtistIndexes } from "@/lib/server/canonical-artist-indexes";
import { connectMongo } from "@/lib/server/mongodb";
import { CanonicalArtistModel, UserModel } from "@/lib/server/models";

export type ArtistContext = {
  user: {
    _id: Types.ObjectId;
    role: "artist" | "team" | "customer";
    isActive: boolean;
    artistKey: string;
    shopDomain: string;
    email: string;
    name?: string;
    onboardingComplete?: boolean;
    mustChangePassword?: boolean;
  };
  canonicalArtist: {
    _id: Types.ObjectId;
    artistKey: string;
    handle?: string;
    displayName?: string;
    instagram?: string;
    websiteUrl?: string;
    locationCity?: string;
    locationCountry?: string;
    bio?: string;
    email?: string;
    profileImages?: {
      avatarUrl?: string;
      heroUrl?: string;
      galleryUrls?: string[];
    };
    consents?: {
      allowOriginalSales?: boolean;
      allowPrintSales?: boolean;
      allowRental?: boolean;
      allowExhibitions?: boolean;
      presentationOnly?: boolean;
    };
    publicProfile?: {
      isVisible?: boolean;
    };
    shopify?: {
      metaobjectGid?: string;
    };
    sync?: {
      dirtyFields?: string[];
    };
  };
  sessionUserId: string;
};

function isDuplicateKeyError(err: unknown) {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}

async function ensureCanonicalArtistForUser(user: {
  _id: Types.ObjectId;
  artistKey: string;
  shopDomain: string;
  email: string;
  name?: string | null;
}) {
  let canonicalArtist = await CanonicalArtistModel.findOne({
    shopDomain: user.shopDomain,
    artistKey: user.artistKey,
  }).lean();

  if (canonicalArtist) return canonicalArtist;

  const fallbackDisplayName = user.name?.trim() || user.email.split("@")[0] || "Artist";
  try {
    await CanonicalArtistModel.updateOne(
      { shopDomain: user.shopDomain, artistKey: user.artistKey },
      {
        $setOnInsert: {
          shopDomain: user.shopDomain,
          artistKey: user.artistKey,
          handle: user.artistKey,
          displayName: fallbackDisplayName,
          email: user.email,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }

  canonicalArtist = await CanonicalArtistModel.findOne({
    shopDomain: user.shopDomain,
    artistKey: user.artistKey,
  }).lean();

  if (!canonicalArtist) {
    throw new Error(`Failed to provision canonical artist for user ${user._id.toString()}`);
  }

  return canonicalArtist;
}

async function loadArtistContext(): Promise<ArtistContext | null> {
  await connectMongo();
  await ensureCanonicalArtistIndexes();

  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.id || !Types.ObjectId.isValid(session.user.id)) {
    return null;
  }

  const user = await UserModel.findById(session.user.id).lean();
  if (!user || user.role !== "artist" || !user.isActive || !user.artistKey || !user.shopDomain) {
    return null;
  }

  const canonicalArtist = await ensureCanonicalArtistForUser({
    _id: user._id,
    artistKey: user.artistKey,
    shopDomain: user.shopDomain,
    email: user.email,
    name: user.name,
  });

  return {
    user: {
      _id: user._id,
      role: user.role,
      isActive: user.isActive,
      artistKey: user.artistKey,
      shopDomain: user.shopDomain,
      email: user.email,
      name: user.name || undefined,
      onboardingComplete: user.onboardingComplete === true,
      mustChangePassword: user.mustChangePassword === true,
    },
    canonicalArtist: {
      _id: canonicalArtist._id,
      artistKey: canonicalArtist.artistKey,
      handle: canonicalArtist.handle || undefined,
      displayName: canonicalArtist.displayName || undefined,
      instagram: canonicalArtist.instagram || undefined,
      websiteUrl: canonicalArtist.websiteUrl || undefined,
      locationCity: canonicalArtist.locationCity || undefined,
      locationCountry: canonicalArtist.locationCountry || undefined,
      bio: canonicalArtist.bio || undefined,
      email: canonicalArtist.email || undefined,
      profileImages: canonicalArtist.profileImages
        ? {
            avatarUrl: canonicalArtist.profileImages.avatarUrl || undefined,
            heroUrl: canonicalArtist.profileImages.heroUrl || undefined,
            galleryUrls: Array.isArray(canonicalArtist.profileImages.galleryUrls)
              ? canonicalArtist.profileImages.galleryUrls
              : [],
          }
        : undefined,
      consents: canonicalArtist.consents,
      publicProfile: canonicalArtist.publicProfile
        ? {
            isVisible: canonicalArtist.publicProfile.isVisible !== false,
          }
        : undefined,
      shopify: canonicalArtist.shopify
        ? {
            metaobjectGid: canonicalArtist.shopify.metaobjectGid || undefined,
          }
        : undefined,
      sync: canonicalArtist.sync,
    },
    sessionUserId: session.user.id,
  };
}

export async function getArtistContext() {
  return loadArtistContext();
}

export async function requireArtistContext(options?: { allowIncompleteOnboarding?: boolean }) {
  const context = await loadArtistContext();
  if (!context) redirect("/login");
  if (!options?.allowIncompleteOnboarding && context.user.onboardingComplete !== true) {
    redirect("/onboarding");
  }
  return context;
}

export async function requireOnboardingContext() {
  const context = await loadArtistContext();
  if (!context) redirect("/login");
  return context;
}

export async function requireArtistApiContext(options?: { allowIncompleteOnboarding?: boolean }) {
  let context: ArtistContext | null = null;
  try {
    context = await loadArtistContext();
  } catch (err) {
    console.error("Failed to load artist API context", err);
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 }),
    };
  }
  if (!context) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (!options?.allowIncompleteOnboarding && context.user.onboardingComplete !== true) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "onboarding_required" }, { status: 403 }),
    };
  }
  return { ok: true as const, context };
}
