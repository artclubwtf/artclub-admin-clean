import { networkProfileInputSchema } from "@artclub/models";

import { mobileError, mobileNetworkContext, serializeMobileProfile, uniqueIdentity } from "@/lib/mobileNetwork";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { NetworkProfileModel } from "@/models/Network";

export async function GET(req: Request) {
  const auth = await mobileNetworkContext(req, true); if (!auth.ok) return auth.response;
  return Response.json({ ok: true, profile: auth.profile ? serializeMobileProfile(auth.profile) : null, onboardingRequired: !auth.profile || auth.user.networkOnboardingCompleted !== true });
}

export async function POST(req: Request) {
  const auth = await mobileNetworkContext(req, true); if (!auth.ok) return auth.response;
  const parsed = networkProfileInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return mobileError("invalid_profile", 400, parsed.error.flatten());
  const identity = await uniqueIdentity(parsed.data.username || parsed.data.displayName, auth.user._id);
  let artist = await CanonicalArtistModel.findOne({ linkedUserId: auth.user._id });
  if (parsed.data.profileType === "artist" && !artist) {
    const artistKey = auth.user.artistKey || `artist_${auth.user._id}`;
    artist = await CanonicalArtistModel.findOneAndUpdate({ shopDomain: auth.user.shopDomain, artistKey }, { $set: { linkedUserId: auth.user._id, displayName: parsed.data.displayName, handle: identity, bio: parsed.data.bio || "", locationCity: parsed.data.city || "", locationCountry: parsed.data.country || "", websiteUrl: parsed.data.website || "", instagram: parsed.data.instagram || "", profileImages: { avatarUrl: parsed.data.profileImageUrl || "", heroUrl: parsed.data.coverImageUrl || "", galleryUrls: [] }, accountStatus: "linked", linkStatus: "linked" }, $setOnInsert: { shopDomain: auth.user.shopDomain, artistKey } }, { upsert: true, new: true });
    auth.user.role = "artist"; auth.user.artistKey = artistKey;
  }
  const profile = await NetworkProfileModel.findOneAndUpdate({ userId: auth.user._id }, { $set: { ...parsed.data, slug: identity, username: identity, profileTypeSource: artist ? "existing_artist_link" : "user_selected", ...(artist ? { canonicalArtistId: artist._id } : {}) } }, { upsert: true, new: true, runValidators: true });
  auth.user.networkProfileType = parsed.data.profileType; auth.user.networkRoleSelectionCompleted = true; auth.user.networkOnboardingCompleted = true; await auth.user.save();
  return Response.json({ ok: true, profile: serializeMobileProfile(profile) }, { status: auth.profile ? 200 : 201 });
}

export async function PATCH(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const parsed = networkProfileInputSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return mobileError("invalid_profile", 400, parsed.error.flatten());
  const update: any = { ...parsed.data }; if (parsed.data.username) { update.username = await uniqueIdentity(parsed.data.username, auth.user._id); update.slug = update.username; }
  const profile = await NetworkProfileModel.findOneAndUpdate({ _id: auth.profile!._id, userId: auth.user._id }, { $set: update }, { new: true, runValidators: true });
  if (!profile) return mobileError("profile_not_found", 404);
  if (profile.canonicalArtistId) await CanonicalArtistModel.updateOne({ _id: profile.canonicalArtistId, linkedUserId: auth.user._id }, { $set: { displayName: profile.displayName, bio: profile.bio || "", locationCity: profile.city || "", locationCountry: profile.country || "", websiteUrl: profile.website || "", instagram: profile.instagram || "", "profileImages.avatarUrl": profile.profileImageUrl || "", "profileImages.heroUrl": profile.coverImageUrl || "" } });
  return Response.json({ ok: true, profile: serializeMobileProfile(profile) });
}
