import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

type ArtistV2User = {
  _id: Types.ObjectId;
  role: "artist" | "team" | "customer";
  isActive: boolean;
  artistKey: string;
  shopDomain: string;
  email: string;
  name?: string;
  onboardingComplete?: boolean;
};

type ArtistV2CanonicalArtist = {
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

type ArtistV2Context =
  | {
      ok: true;
      user: ArtistV2User;
      canonicalArtist: ArtistV2CanonicalArtist;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireArtistV2Context(): Promise<ArtistV2Context> {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.id || !Types.ObjectId.isValid(session.user.id)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  const user = (await UserModel.findById(session.user.id).lean()) as ArtistV2User | null;
  if (!user || user.role !== "artist" || !user.isActive) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  if (!user.shopDomain) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "artist_not_initialized" }, { status: 400 }) };
  }

  const canonicalArtist = (await CanonicalArtistModel.findOne({
    shopDomain: user.shopDomain,
    linkedUserId: user._id,
  }).lean()) as ArtistV2CanonicalArtist | null;
  if (!canonicalArtist) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "artist_account_not_linked" }, { status: 403 }) };
  }

  return { ok: true, user: { ...user, artistKey: canonicalArtist.artistKey }, canonicalArtist };
}
