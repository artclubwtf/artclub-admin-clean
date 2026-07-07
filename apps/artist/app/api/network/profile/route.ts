import { networkOnboardingRoles, networkProfileInputSchema } from "@artclub/models";
import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { findSecureArtistForUser } from "@/lib/server/network-onboarding";
import { uniqueProfileIdentity } from "@/lib/server/network-registration";
import { apiError } from "@/lib/server/network-service";
import { CanonicalArtistModel, NetworkProfileModel, UserModel } from "@/lib/server/models";
import { resolveUnifiedProfileBySlug } from "@/lib/server/unified-profile";
import { hydrateNetworkMediaKeys } from "@/lib/server/network-media";
import { autoPushArtistToShopify } from "@/lib/server/shopify-auto-sync";

async function finalizeShopParticipation(artist: any) {
  if (!artist?.shopParticipation?.enabled) return;
  const result = await autoPushArtistToShopify({ shopDomain: artist.shopDomain, artistKey: artist.artistKey, shouldPush: true });
  const status = result.ok ? (result.queued ? "pending" : "ready") : "setup_required";
  await CanonicalArtistModel.updateOne({ _id: artist._id }, { $set: { "shopParticipation.status": status, "shopParticipation.lastAttemptAt": new Date() } });
}

export async function GET() {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const profile = await resolveUnifiedProfileBySlug(auth.context.profile.slug);
  return Response.json({ ok: true, profile: profile || serializeNetworkProfile(auth.context.profile) });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext({ allowMissingProfile: true }); if (!auth.ok) return auth.response;
  const selectedType = auth.context.user.networkProfileType as (typeof networkOnboardingRoles)[number] | undefined;
  if (auth.context.user.networkRoleSelectionCompleted !== true || !networkOnboardingRoles.includes(selectedType as any)) return apiError("role_selection_required", 409);
  const body = hydrateNetworkMediaKeys(await req.json().catch(() => null));
  const parsed = networkProfileInputSchema.safeParse({ ...(body || {}), profileType: selectedType });
  if (!parsed.success) return apiError("invalid_profile", 400, parsed.error.flatten());
  const session = await UserModel.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const user = await UserModel.findById(auth.context.user._id).session(session);
      if (!user) throw new Error("user_not_found");
      let artist = await findSecureArtistForUser(user, session);
      const identity = await uniqueProfileIdentity(parsed.data.username || parsed.data.displayName, session, user._id);
      let source: "existing_artist_link" | "user_selected" = artist ? "existing_artist_link" : "user_selected";
      if (selectedType === "artist" && !artist) {
        const artistKey = user.artistKey || `artist_${user._id}`;
        artist = await CanonicalArtistModel.findOneAndUpdate(
          { shopDomain: user.shopDomain, artistKey },
          { $set: { linkedUserId: user._id, displayName: parsed.data.displayName, handle: identity, bio: parsed.data.bio || "", locationCity: parsed.data.city || "", locationCountry: parsed.data.country || "", websiteUrl: parsed.data.website || "", instagram: parsed.data.instagram || "", profileImages: { avatarUrl: parsed.data.profileImageUrl || "", heroUrl: parsed.data.coverImageUrl || "", galleryUrls: [] }, accountStatus: "linked", linkStatus: "linked", ...(parsed.data.shopEnabled !== undefined ? { shopParticipation: { enabled: parsed.data.shopEnabled, status: parsed.data.shopEnabled ? "setup_required" : "disabled", ...(parsed.data.shopEnabled ? { requestedAt: new Date() } : {}) } } : {}) }, $setOnInsert: { shopDomain: user.shopDomain, artistKey } },
          { upsert: true, new: true, session },
        );
        user.role = "artist"; user.artistKey = artistKey;
      }
      let profile = await NetworkProfileModel.findOne({ userId: user._id }).session(session);
      if (!profile && artist) profile = await NetworkProfileModel.findOne({ canonicalArtistId: artist._id }).session(session);
      if (profile && String(profile.userId) !== String(user._id)) {
        const ownerExists = await UserModel.exists({ _id: profile.userId }).session(session);
        if (ownerExists) throw new Error("artist_profile_owned_by_another_user");
      }
      const { shopEnabled: _shopEnabled, ...networkFields } = parsed.data;
      const profileData = { ...networkFields, profileType: selectedType, profileTypeSource: source, slug: identity, username: identity, userId: user._id, ...(artist ? { canonicalArtistId: artist._id } : {}) };
      if (profile) { profile.set(profileData); await profile.save({ session }); }
      else { profile = new NetworkProfileModel(profileData); await profile.save({ session }); }
      if (artist) {
        artist.linkedUserId = user._id; artist.accountStatus = "linked"; artist.linkStatus = "linked";
        artist.displayName = parsed.data.displayName; artist.bio = parsed.data.bio || ""; artist.locationCity = parsed.data.city || ""; artist.locationCountry = parsed.data.country || ""; artist.websiteUrl = parsed.data.website || ""; artist.instagram = parsed.data.instagram || "";
        artist.profileImages = { ...(artist.profileImages || {}), avatarUrl: parsed.data.profileImageUrl || artist.profileImages?.avatarUrl || "", heroUrl: parsed.data.coverImageUrl || artist.profileImages?.heroUrl || "", galleryUrls: artist.profileImages?.galleryUrls || [] };
        if (parsed.data.shopEnabled !== undefined) artist.shopParticipation = { ...(artist.shopParticipation || {}), enabled: parsed.data.shopEnabled, status: parsed.data.shopEnabled ? "setup_required" : "disabled", ...(parsed.data.shopEnabled ? { requestedAt: artist.shopParticipation?.requestedAt || new Date() } : {}) };
        await artist.save({ session });
      }
      user.networkProfileType = selectedType; user.networkRoleSelectionCompleted = true; user.networkOnboardingCompleted = true; await user.save({ session });
      return profile;
    });
    if (!result) return apiError("profile_creation_failed", 500);
    if (parsed.data.shopEnabled && result.canonicalArtistId) { const artist = await CanonicalArtistModel.findById(result.canonicalArtistId); await finalizeShopParticipation(artist); }
    return Response.json({ ok: true, profile: serializeNetworkProfile(result) }, { status: auth.context.profile ? 200 : 201 });
  } catch (error: any) {
    if (error?.code === 11000) return apiError("profile_identity_conflict", 409);
    console.error("[network-onboarding] profile_failed", { name: error?.name || "Error", code: error?.code || null });
    return apiError("profile_creation_failed", 500);
  } finally { await session.endSession(); }
}

export async function PATCH(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const parsed = networkProfileInputSchema.partial().safeParse(hydrateNetworkMediaKeys(await req.json().catch(() => null)));
  if (!parsed.success) return apiError("invalid_profile", 400, parsed.error.flatten());
  const update: Record<string, unknown> = { ...parsed.data };
  delete update.shopEnabled;
  if (parsed.data.username) { const identity = await uniqueProfileIdentity(parsed.data.username, undefined, auth.context.user._id); update.username = identity; update.slug = identity; }
  const artist = await findSecureArtistForUser(auth.context.user);
  if (!artist && parsed.data.profileType === "artist" && auth.context.profile.profileType !== "artist") {
    await Promise.all([
      UserModel.updateOne({ _id: auth.context.user._id }, { $set: { networkProfileType: "artist", networkRoleSelectionCompleted: true, networkOnboardingCompleted: false } }),
      NetworkProfileModel.updateOne({ _id: auth.context.profile._id, userId: auth.context.user._id }, { $set: { profileType: "artist", profileTypeSource: "user_selected" } }),
    ]);
    return Response.json({ ok: true, next: "/onboarding/profile", profile: serializeNetworkProfile({ ...auth.context.profile.toObject(), profileType: "artist", profileTypeSource: "user_selected" }) });
  }
  if (artist) {
    update.profileType = "artist"; update.profileTypeSource = "existing_artist_link";
    if (parsed.data.displayName !== undefined) artist.displayName = parsed.data.displayName;
    if (parsed.data.bio !== undefined) artist.bio = parsed.data.bio;
    if (parsed.data.city !== undefined) artist.locationCity = parsed.data.city;
    if (parsed.data.country !== undefined) artist.locationCountry = parsed.data.country;
    if (parsed.data.website !== undefined) artist.websiteUrl = parsed.data.website;
    if (parsed.data.instagram !== undefined) artist.instagram = parsed.data.instagram;
    if (parsed.data.profileImageUrl !== undefined || parsed.data.coverImageUrl !== undefined) {
      artist.profileImages = {
        ...(artist.profileImages || {}),
        avatarUrl: parsed.data.profileImageUrl !== undefined ? parsed.data.profileImageUrl : artist.profileImages?.avatarUrl || "",
        heroUrl: parsed.data.coverImageUrl !== undefined ? parsed.data.coverImageUrl : artist.profileImages?.heroUrl || "",
        galleryUrls: artist.profileImages?.galleryUrls || [],
      };
    }
    if (parsed.data.shopEnabled !== undefined) artist.shopParticipation = { ...(artist.shopParticipation || {}), enabled: parsed.data.shopEnabled, status: parsed.data.shopEnabled ? "setup_required" : "disabled", ...(parsed.data.shopEnabled ? { requestedAt: artist.shopParticipation?.requestedAt || new Date() } : {}) };
    await artist.save();
    if (parsed.data.shopEnabled) await finalizeShopParticipation(artist);
  } else if (parsed.data.profileType && networkOnboardingRoles.includes(parsed.data.profileType as any)) {
    update.profileTypeSource = "user_selected";
    await UserModel.updateOne({ _id: auth.context.user._id }, { $set: { networkProfileType: parsed.data.profileType, networkRoleSelectionCompleted: true, networkOnboardingCompleted: true } });
  } else delete update.profileType;
  try {
    const profile = await NetworkProfileModel.findOneAndUpdate({ _id: auth.context.profile._id, userId: auth.context.user._id }, { $set: update }, { new: true, runValidators: true });
    if (!profile) return apiError("profile_not_found", 404);
    const unified = await resolveUnifiedProfileBySlug(profile.slug);
    return Response.json({ ok: true, profile: unified || serializeNetworkProfile(profile) });
  } catch (error: any) { if (error?.code === 11000) return apiError("username_unavailable", 409); throw error; }
}
