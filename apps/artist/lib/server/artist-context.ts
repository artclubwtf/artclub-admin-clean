import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/server/auth";
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
    shopify?: {
      metaobjectGid?: string;
    };
    sync?: {
      dirtyFields?: string[];
    };
  };
  sessionUserId: string;
};

async function loadArtistContext(): Promise<ArtistContext | null> {
  await connectMongo();

  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.id || !Types.ObjectId.isValid(session.user.id)) {
    return null;
  }

  const user = await UserModel.findById(session.user.id).lean();
  if (!user || user.role !== "artist" || !user.isActive || !user.artistKey || !user.shopDomain) {
    return null;
  }

  let canonicalArtist = await CanonicalArtistModel.findOne({
    shopDomain: user.shopDomain,
    artistKey: user.artistKey,
  }).lean();

  if (!canonicalArtist) {
    const fallbackDisplayName = user.name?.trim() || user.email.split("@")[0] || "Artist";
    const created = await CanonicalArtistModel.create({
      shopDomain: user.shopDomain,
      artistKey: user.artistKey,
      handle: user.artistKey,
      displayName: fallbackDisplayName,
      email: user.email,
    });
    canonicalArtist = created.toObject();
  }

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
  const context = await loadArtistContext();
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
