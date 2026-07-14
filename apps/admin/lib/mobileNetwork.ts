import { calculateProfileCompletion, networkSlug, type NetworkProfileType } from "@artclub/models";
import { Types } from "mongoose";

import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { AnalyticsEventModel } from "@/models/AnalyticsEvent";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { ConnectionModel, NetworkEventModel, NetworkProfileModel } from "@/models/Network";
import { UserModel } from "@/models/User";

export function mobileError(code: string, status = 400, details?: unknown) { return Response.json({ ok: false, error: { code, details } }, { status }); }
export async function mobileNetworkContext(req: Request, allowMissingProfile = false) {
  const sessionUser = await getMobileUserFromRequest(req);
  if (!sessionUser) return { ok: false as const, response: mobileError("unauthorized", 401) };
  const user = await UserModel.findById(sessionUser.id);
  if (!user || !user.isActive) return { ok: false as const, response: mobileError("unauthorized", 401) };
  let profile = await NetworkProfileModel.findOne({ userId: user._id });
  if (!profile && user.role === "artist") {
    const artist = await CanonicalArtistModel.findOne({ linkedUserId: user._id });
    if (artist) {
      const identity = await uniqueIdentity(artist.publicSlug || artist.handle || artist.displayName);
      profile = await NetworkProfileModel.findOneAndUpdate({ userId: user._id }, { $setOnInsert: { userId: user._id, profileType: "artist", profileTypeSource: "existing_artist_link", slug: identity, username: identity, displayName: artist.displayName, bio: artist.bio || "", city: artist.locationCity || "", country: artist.locationCountry || "", website: artist.websiteUrl || "", instagram: artist.instagram || "", profileImageUrl: artist.profileImages?.avatarUrl || "", coverImageUrl: artist.profileImages?.heroUrl || "", canonicalArtistId: artist._id, isPublic: artist.publicProfile?.isVisible !== false } }, { upsert: true, new: true });
    }
  }
  if (!profile && !allowMissingProfile) return { ok: false as const, response: mobileError("network_onboarding_required", 403) };
  return { ok: true as const, user, profile };
}

export async function uniqueIdentity(value: string, excludeUserId?: unknown) {
  const base = networkSlug(value);
  for (let index = 0; index < 1000; index += 1) {
    const slug = index ? `${base}-${index + 1}` : base;
    const query: any = { slug, ...(excludeUserId ? { userId: { $ne: excludeUserId } } : {}) };
    const exists = await NetworkProfileModel.exists(query);
    if (!exists) return slug;
  }
  return `${base}-${new Types.ObjectId().toString().slice(-8)}`;
}

export function serializeMobileProfile(profile: any) {
  return { id: String(profile._id), userId: String(profile.userId), profileType: profile.profileType, slug: profile.slug, username: profile.username, displayName: profile.displayName, bio: profile.bio || "", city: profile.city || "", country: profile.country || "", disciplines: profile.disciplines || [], interests: profile.interests || [], website: profile.website || "", instagram: profile.instagram || "", profileImageUrl: profile.profileImageUrl || "", coverImageUrl: profile.coverImageUrl || "", canonicalArtistId: profile.canonicalArtistId ? String(profile.canonicalArtistId) : undefined, isVerified: profile.isVerified === true };
}

export async function mobileProfileSummary(profile: any) {
  const [artworkCount, eventCount, profileViews, newConnections] = await Promise.all([
    profile.canonicalArtistId ? CanonicalProductModel.countDocuments({ canonicalArtistId: profile.canonicalArtistId, type: "artwork", status: { $ne: "archived" } }) : 0,
    NetworkEventModel.countDocuments({ organizerProfileId: profile._id }),
    AnalyticsEventModel.countDocuments({ eventType: "profile_view", targetProfileId: profile._id, createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } }),
    ConnectionModel.countDocuments({ status: "accepted", respondedAt: { $gte: new Date(Date.now() - 30 * 86_400_000) }, $or: [{ requesterProfileId: profile._id }, { recipientProfileId: profile._id }] }),
  ]);
  return { profile: serializeMobileProfile(profile), completion: calculateProfileCompletion({ profileType: profile.profileType as NetworkProfileType, displayName: profile.displayName, profileImageUrl: profile.profileImageUrl, bio: profile.bio, city: profile.city, country: profile.country, website: profile.website, instagram: profile.instagram, disciplines: profile.disciplines, interests: profile.interests, artworkCount, eventCount }), profileViews, newConnections, artworkCount, eventCount };
}
