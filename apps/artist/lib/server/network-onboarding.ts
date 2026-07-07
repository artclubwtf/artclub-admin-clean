import type { ClientSession } from "mongoose";
import { networkOnboardingPath } from "@artclub/models";
import { CanonicalArtistModel, NetworkProfileModel, UserModel } from "@/lib/server/models";
import { uniqueProfileIdentity } from "@/lib/server/network-registration";

export const confirmedProfileTypeSources = new Set(["user_selected", "existing_artist_link", "admin_assigned"]);

export async function findSecureArtistForUser(user: any, session?: ClientSession) {
  const options = session ? { session } : {};
  let artist = await CanonicalArtistModel.findOne({ linkedUserId: user._id }, null, options);
  if (artist) return artist;
  if (user.artistKey) {
    artist = await CanonicalArtistModel.findOne({ shopDomain: user.shopDomain, artistKey: user.artistKey, $or: [{ linkedUserId: user._id }, { linkedUserId: null }, { linkedUserId: { $exists: false } }] }, null, options);
    if (artist) return artist;
  }
  const profile = await NetworkProfileModel.findOne({ userId: user._id, canonicalArtistId: { $exists: true, $ne: null } }, null, options);
  if (!profile?.canonicalArtistId) return null;
  return CanonicalArtistModel.findOne({ _id: profile.canonicalArtistId, $or: [{ linkedUserId: user._id }, { linkedUserId: null }, { linkedUserId: { $exists: false } }] }, null, options);
}

export async function ensureExistingArtistNetworkIdentity(user: any) {
  const artist = await findSecureArtistForUser(user);
  if (!artist) return null;
  let profile = await NetworkProfileModel.findOne({ userId: user._id });
  if (!profile) profile = await NetworkProfileModel.findOne({ canonicalArtistId: artist._id });
  if (profile && String(profile.userId) !== String(user._id)) {
    const ownerExists = await UserModel.exists({ _id: profile.userId });
    if (ownerExists) return null;
  }
  if (!profile) {
    const identity = await uniqueProfileIdentity(artist.displayName || user.name || "artist");
    profile = await NetworkProfileModel.create({ userId: user._id, canonicalArtistId: artist._id, profileType: "artist", profileTypeSource: "existing_artist_link", slug: identity, username: identity, displayName: artist.displayName || user.name || "Artist", bio: artist.bio || "", city: artist.locationCity || "", country: artist.locationCountry || "", website: artist.websiteUrl || "", instagram: artist.instagram || "", profileImageUrl: artist.profileImages?.avatarUrl || "", coverImageUrl: artist.profileImages?.heroUrl || "", isPublic: artist.publicProfile?.isVisible !== false });
  } else {
    profile.userId = user._id;
    profile.canonicalArtistId = artist._id;
    profile.profileType = "artist";
    profile.profileTypeSource = "existing_artist_link";
    await profile.save();
  }
  artist.linkedUserId = user._id; artist.accountStatus = "linked"; artist.linkStatus = "linked"; await artist.save();
  await UserModel.updateOne({ _id: user._id }, { $set: { role: "artist", artistKey: artist.artistKey, networkProfileType: "artist", networkRoleSelectionCompleted: true, networkOnboardingCompleted: false } });
  return { artist, profile };
}

export { networkOnboardingPath };
