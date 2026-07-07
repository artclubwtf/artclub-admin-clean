import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/server/auth";
import { connectMongo } from "@/lib/server/mongodb";
import { CanonicalArtistModel, NetworkProfileModel, UserModel } from "@/lib/server/models";
import { networkSlug } from "@artclub/models";

async function uniqueSlug(baseValue: string) {
  const base = networkSlug(baseValue);
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if (!(await NetworkProfileModel.exists({ slug }))) return slug;
  }
  return `${base}-${new Types.ObjectId().toString().slice(-8)}`;
}

export async function ensureArtistNetworkProfile(user: any) {
  const existing = await NetworkProfileModel.findOne({ userId: user._id });
  if (existing) return existing;
  if (user.role !== "artist") return null;

  const artist = await CanonicalArtistModel.findOne({ shopDomain: user.shopDomain, linkedUserId: user._id }).lean();
  if (!artist) return null;
  const preferredSlug = artist.publicSlug || artist.handle || artist.artistKey || user.name || user.email.split("@")[0];
  const normalized = networkSlug(preferredSlug);
  const slugOwner = await NetworkProfileModel.findOne({ slug: normalized }).select({ canonicalArtistId: 1 }).lean();
  const slug = slugOwner && String(slugOwner.canonicalArtistId || "") !== String(artist._id) ? await uniqueSlug(preferredSlug) : normalized;
  try {
    return await NetworkProfileModel.findOneAndUpdate(
      { userId: user._id },
      { $setOnInsert: {
        userId: user._id, profileType: "artist", slug, username: slug,
        displayName: artist.displayName || user.name || user.email.split("@")[0], bio: artist.bio || "",
        city: artist.locationCity || "", country: artist.locationCountry || "", website: artist.websiteUrl || "",
        instagram: artist.instagram || "", profileImageUrl: artist.profileImages?.avatarUrl || "",
        coverImageUrl: artist.profileImages?.heroUrl || "", canonicalArtistId: artist._id,
        isPublic: artist.publicProfile?.isVisible !== false,
      } },
      { upsert: true, new: true },
    );
  } catch (error: any) {
    if (error?.code === 11000) return NetworkProfileModel.findOne({ userId: user._id });
    throw error;
  }
}

export async function loadNetworkContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !Types.ObjectId.isValid(session.user.id)) return null;
  await connectMongo();
  const user = await UserModel.findById(session.user.id).lean();
  if (!user || !user.isActive) return null;
  const profile = (await NetworkProfileModel.findOne({ userId: user._id })) || (await ensureArtistNetworkProfile(user));
  return { user, profile, sessionUserId: session.user.id };
}

export async function requireNetworkContext(options: { allowMissingProfile?: boolean } = {}) {
  const context = await loadNetworkContext();
  if (!context) redirect("/login");
  if (!context.profile && !options.allowMissingProfile) redirect("/network-onboarding");
  return context;
}

type LoadedNetworkContext = NonNullable<Awaited<ReturnType<typeof loadNetworkContext>>>;
type CompleteNetworkContext = Omit<LoadedNetworkContext, "profile"> & { profile: NonNullable<LoadedNetworkContext["profile"]> };
type NetworkAuthFailure = { ok: false; response: NextResponse };
export function requireNetworkApiContext(): Promise<{ ok: true; context: CompleteNetworkContext } | NetworkAuthFailure>;
export function requireNetworkApiContext(options: { allowMissingProfile: true }): Promise<{ ok: true; context: LoadedNetworkContext } | NetworkAuthFailure>;
export async function requireNetworkApiContext(options: { allowMissingProfile?: boolean } = {}): Promise<{ ok: true; context: LoadedNetworkContext } | NetworkAuthFailure> {
  try {
    const context = await loadNetworkContext();
    if (!context) return { ok: false as const, response: NextResponse.json({ ok: false, error: { code: "unauthorized" } }, { status: 401 }) };
    if (!context.profile && !options.allowMissingProfile) return { ok: false as const, response: NextResponse.json({ ok: false, error: { code: "network_onboarding_required" } }, { status: 403 }) };
    if (!options.allowMissingProfile && context.user.networkOnboardingCompleted !== true) return { ok: false as const, response: NextResponse.json({ ok: false, error: { code: "network_onboarding_required", next: context.user.networkRoleSelectionCompleted === true ? "/onboarding/profile" : "/onboarding/role" } }, { status: 403 }) };
    return { ok: true as const, context };
  } catch (error) {
    console.error("Failed to load network API context", error);
    return { ok: false as const, response: NextResponse.json({ ok: false, error: { code: "database_unavailable" } }, { status: 503 }) };
  }
}

export function serializeNetworkProfile(profile: any) {
  return {
    id: profile._id.toString(), profileType: profile.profileType, profileTypeSource: profile.profileTypeSource, slug: profile.slug, displayName: profile.displayName,
    username: profile.username, bio: profile.bio || "", city: profile.city || "", country: profile.country || "",
    disciplines: profile.disciplines || [], interests: profile.interests || [], website: profile.website || "",
    instagram: profile.instagram || "", profileImageUrl: profile.profileImageUrl || "", coverImageUrl: profile.coverImageUrl || "",
    isPublic: profile.isPublic !== false, isVerified: profile.isVerified === true, allowsMessages: profile.allowsMessages === true,
    donationEnabled: profile.donationEnabled === true, canonicalArtistId: profile.canonicalArtistId?.toString(),
  };
}
