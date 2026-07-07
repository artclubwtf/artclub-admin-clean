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
  ownershipMode: "linked_user";
  sessionUserId: string;
};

type ArtistContextLoadResult =
  | { status: "ok"; context: ArtistContext }
  | { status: "unauthenticated" }
  | { status: "not_linked" };

async function loadArtistContextResult(): Promise<ArtistContextLoadResult> {
  await connectMongo();
  await ensureCanonicalArtistIndexes();

  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.id || !Types.ObjectId.isValid(session.user.id)) {
    return { status: "unauthenticated" };
  }

  const user = await UserModel.findById(session.user.id).lean();
  if (!user || user.role !== "artist" || !user.isActive || !user.shopDomain) {
    return { status: "unauthenticated" };
  }

  const canonicalArtist = await CanonicalArtistModel.findOne({
    shopDomain: user.shopDomain,
    linkedUserId: user._id,
  }).lean();

  if (!canonicalArtist) return { status: "not_linked" };

  return {
    status: "ok",
    context: {
      user: {
        _id: user._id,
        role: user.role,
        isActive: user.isActive,
        artistKey: canonicalArtist.artistKey,
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
      ownershipMode: "linked_user",
      sessionUserId: session.user.id,
    },
  };
}

async function loadArtistContext(): Promise<ArtistContext | null> {
  const result = await loadArtistContextResult();
  return result.status === "ok" ? result.context : null;
}

export async function getArtistContext() {
  return loadArtistContext();
}

export async function requireArtistContext(options?: { allowIncompleteOnboarding?: boolean }) {
  const result = await loadArtistContextResult();
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "not_linked") redirect("/account-pending");
  const { context } = result;
  if (!options?.allowIncompleteOnboarding && context.user.onboardingComplete !== true) {
    redirect("/onboarding");
  }
  return context;
}

export async function requireOnboardingContext() {
  const result = await loadArtistContextResult();
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "not_linked") redirect("/account-pending");
  return result.context;
}

export async function requireArtistApiContext(options?: { allowIncompleteOnboarding?: boolean }) {
  let context: ArtistContext | null = null;
  let status: ArtistContextLoadResult["status"] = "unauthenticated";
  try {
    const result = await loadArtistContextResult();
    status = result.status;
    context = result.status === "ok" ? result.context : null;
  } catch (err) {
    console.error("Failed to load artist API context", err);
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "database_unavailable" }, { status: 503 }),
    };
  }
  if (!context) {
    if (status === "unauthenticated") {
      return { ok: false as const, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
    }
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "artist_account_not_linked" }, { status: 403 }),
    };
  }
  if (!options?.allowIncompleteOnboarding && context.user.onboardingComplete !== true) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "onboarding_required" }, { status: 403 }),
    };
  }
  return { ok: true as const, context };
}
