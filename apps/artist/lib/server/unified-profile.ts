import { Types } from "mongoose";
import { networkSlug } from "@artclub/models";
import { CanonicalArtistModel, NetworkProfileModel, UserModel } from "@/lib/server/models";
import { ensureArtistNetworkProfile } from "@/lib/server/network-context";

export type UnifiedProfile = {
  id: string;
  networkProfileId?: string;
  canonicalArtistId?: string;
  userId: string;
  profileType: string;
  slug: string;
  displayName: string;
  username: string;
  bio: string;
  city: string;
  country: string;
  disciplines: string[];
  interests: string[];
  website: string;
  instagram: string;
  profileImageUrl: string;
  coverImageUrl: string;
  isPublic: boolean;
  isVerified: boolean;
  donationEnabled: boolean;
};

function artistUnified(artist: any, user: any, profile?: any): UnifiedProfile {
  const slug = artist.publicSlug || artist.handle || profile?.slug || networkSlug(artist.displayName);
  return {
    id: profile?._id?.toString() || `artist:${artist._id}`,
    networkProfileId: profile?._id?.toString(), canonicalArtistId: artist._id.toString(), userId: user._id.toString(),
    profileType: "artist", slug, displayName: artist.displayName || user.name || profile?.displayName || "Artist",
    username: profile?.username || artist.handle || slug, bio: artist.bio || "", city: artist.locationCity || "", country: artist.locationCountry || "",
    disciplines: profile?.disciplines || [], interests: profile?.interests || [], website: artist.websiteUrl || "", instagram: artist.instagram || "",
    profileImageUrl: artist.profileImages?.avatarUrl || "", coverImageUrl: artist.profileImages?.heroUrl || "",
    isPublic: artist.publicProfile?.isVisible !== false && profile?.isPublic !== false, isVerified: profile?.isVerified === true,
    donationEnabled: profile?.donationEnabled === true,
  };
}

function standardUnified(profile: any): UnifiedProfile {
  return {
    id: profile._id.toString(), networkProfileId: profile._id.toString(), userId: profile.userId.toString(), profileType: profile.profileType,
    slug: profile.slug, displayName: profile.displayName, username: profile.username, bio: profile.bio || "", city: profile.city || "", country: profile.country || "",
    disciplines: profile.disciplines || [], interests: profile.interests || [], website: profile.website || "", instagram: profile.instagram || "",
    profileImageUrl: profile.profileImageUrl || "", coverImageUrl: profile.coverImageUrl || "", isPublic: profile.isPublic !== false,
    isVerified: profile.isVerified === true, donationEnabled: profile.donationEnabled === true,
  };
}

export async function resolveUnifiedProfileBySlug(rawSlug: string): Promise<UnifiedProfile | null> {
  const slug = rawSlug.trim().toLowerCase(); if (!slug) return null;
  const profile = await NetworkProfileModel.findOne({ slug, suspendedAt: { $exists: false } }).lean();
  if (profile?.profileType === "artist") {
    const artist = await CanonicalArtistModel.findOne({ $or: [{ _id: profile.canonicalArtistId }, { linkedUserId: profile.userId }] }).lean();
    const user = await UserModel.findById(profile.userId).lean();
    if (artist && user) return artistUnified(artist, user, profile);
  }
  if (profile) return standardUnified(profile);
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const artist = await CanonicalArtistModel.findOne({ $or: [{ publicSlug: { $regex: `^${escaped}$`, $options: "i" } }, { handle: { $regex: `^${escaped}$`, $options: "i" } }], linkedUserId: { $exists: true, $ne: null }, "publicProfile.isVisible": { $ne: false } }).lean();
  if (!artist) return null; const user = await UserModel.findOne({ _id: artist.linkedUserId, isActive: true }).lean();
  return user ? artistUnified(artist, user) : null;
}

export async function resolveUnifiedProfileByIdentity(identity: string): Promise<UnifiedProfile | null> {
  if (identity.startsWith("artist:") && Types.ObjectId.isValid(identity.slice(7))) {
    const artist = await CanonicalArtistModel.findOne({ _id: identity.slice(7), linkedUserId: { $exists: true, $ne: null } }).lean();
    if (!artist) return null; const user = await UserModel.findById(artist.linkedUserId).lean();
    if (!user) return null; const profile = await NetworkProfileModel.findOne({ userId: user._id }).lean(); return artistUnified(artist, user, profile);
  }
  if (!Types.ObjectId.isValid(identity)) return null;
  const profile = await NetworkProfileModel.findOne({ _id: identity, suspendedAt: { $exists: false } }).lean();
  if (!profile) return null;
  if (profile.profileType !== "artist") return standardUnified(profile);
  const artist = await CanonicalArtistModel.findOne({ $or: [{ _id: profile.canonicalArtistId }, { linkedUserId: profile.userId }] }).lean();
  const user = await UserModel.findById(profile.userId).lean(); return artist && user ? artistUnified(artist, user, profile) : standardUnified(profile);
}

export async function materializeUnifiedProfile(identity: string) {
  if (Types.ObjectId.isValid(identity)) return NetworkProfileModel.findById(identity);
  const unified = await resolveUnifiedProfileByIdentity(identity); if (!unified || unified.profileType !== "artist") return null;
  const user = await UserModel.findById(unified.userId); return user ? ensureArtistNetworkProfile(user) : null;
}

export async function resolveUnifiedArtistsByIds(ids: Array<Types.ObjectId | string>) {
  const artists = await CanonicalArtistModel.find({ _id: { $in: ids }, linkedUserId: { $exists: true, $ne: null } }).lean();
  const [profiles, users] = await Promise.all([
    NetworkProfileModel.find({ $or: [{ canonicalArtistId: { $in: artists.map((artist) => artist._id) } }, { userId: { $in: artists.map((artist) => artist.linkedUserId) } }] }).lean(),
    UserModel.find({ _id: { $in: artists.map((artist) => artist.linkedUserId) }, isActive: true }).lean(),
  ]);
  const profilesByArtist = new Map(profiles.filter((profile) => profile.canonicalArtistId).map((profile) => [profile.canonicalArtistId!.toString(), profile]));
  const profilesByUser = new Map(profiles.map((profile) => [profile.userId.toString(), profile])); const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return new Map(artists.flatMap((artist) => { const user = usersById.get(artist.linkedUserId!.toString()); return user ? [[artist._id.toString(), artistUnified(artist, user, profilesByArtist.get(artist._id.toString()) || profilesByUser.get(user._id.toString()))] as const] : []; }));
}

export async function listUnifiedProfiles(input: { q?: string; type?: string; city?: string; country?: string; excludeUserId?: unknown }) {
  const escaped = (input.q || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const profileFilter: any = { isPublic: true, suspendedAt: { $exists: false }, ...(input.excludeUserId ? { userId: { $ne: input.excludeUserId } } : {}) };
  if (input.type) profileFilter.profileType = input.type;
  if (input.city) profileFilter.city = new RegExp(input.city, "i"); if (input.country) profileFilter.country = new RegExp(input.country, "i");
  if (escaped) profileFilter.$or = [{ displayName: new RegExp(escaped, "i") }, { username: new RegExp(escaped, "i") }, { disciplines: new RegExp(escaped, "i") }, { interests: new RegExp(escaped, "i") }];
  const profiles = await NetworkProfileModel.find(profileFilter).sort({ isVerified: -1, updatedAt: -1 }).limit(60).lean();
  const unified: UnifiedProfile[] = [];
  const artistProfiles = profiles.filter((profile) => profile.profileType === "artist");
  const [profileArtists, profileUsers] = await Promise.all([
    CanonicalArtistModel.find({ $or: [{ _id: { $in: artistProfiles.map((profile) => profile.canonicalArtistId).filter(Boolean) } }, { linkedUserId: { $in: artistProfiles.map((profile) => profile.userId) } }] } as any).lean(),
    UserModel.find({ _id: { $in: artistProfiles.map((profile) => profile.userId) } }).lean(),
  ]);
  const artistsById = new Map(profileArtists.map((artist) => [artist._id.toString(), artist])); const artistsByUser = new Map(profileArtists.filter((artist) => artist.linkedUserId).map((artist) => [artist.linkedUserId!.toString(), artist])); const profileUsersById = new Map(profileUsers.map((user) => [user._id.toString(), user]));
  for (const profile of profiles) {
    if (profile.profileType === "artist") { const artist = artistsById.get(profile.canonicalArtistId?.toString() || "") || artistsByUser.get(profile.userId.toString()); const user = profileUsersById.get(profile.userId.toString()); if (artist && user) unified.push(artistUnified(artist, user, profile)); else unified.push(standardUnified(profile)); }
    else unified.push(standardUnified(profile));
  }
  if (!input.type || input.type === "artist") {
    const represented = new Set(unified.filter((item) => item.profileType === "artist").map((item) => item.canonicalArtistId));
    const artistFilter: any = { linkedUserId: { $exists: true, $ne: null }, "publicProfile.isVisible": { $ne: false } };
    if (escaped) artistFilter.$or = [{ displayName: new RegExp(escaped, "i") }, { handle: new RegExp(escaped, "i") }, { bio: new RegExp(escaped, "i") }];
    if (input.city) artistFilter.locationCity = new RegExp(input.city, "i"); if (input.country) artistFilter.locationCountry = new RegExp(input.country, "i");
    const artists = await CanonicalArtistModel.find(artistFilter).sort({ updatedAt: -1 }).limit(60).lean();
    const users = await UserModel.find({ _id: { $in: artists.map((item) => item.linkedUserId) }, isActive: true }).lean(); const usersById = new Map(users.map((item) => [item._id.toString(), item]));
    for (const artist of artists) { if (represented.has(artist._id.toString())) continue; const user = usersById.get(artist.linkedUserId!.toString()); if (user && String(user._id) !== String(input.excludeUserId || "")) unified.push(artistUnified(artist, user)); }
  }
  return unified.slice(0, 40);
}
