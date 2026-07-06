import { networkProfileInputSchema } from "@artclub/models";
import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError } from "@/lib/server/network-service";
import { NetworkProfileModel } from "@/lib/server/models";
import { CanonicalArtistModel } from "@/lib/server/models";
import { resolveUnifiedProfileBySlug } from "@/lib/server/unified-profile";

export async function GET() {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const profile = await resolveUnifiedProfileBySlug(auth.context.profile.slug);
  return Response.json({ ok: true, profile: profile || serializeNetworkProfile(auth.context.profile) });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext({ allowMissingProfile: true });
  if (!auth.ok) return auth.response;
  if (auth.context.profile) return apiError("profile_already_exists", 409);
  const parsed = networkProfileInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_profile", 400, parsed.error.flatten());
  if (auth.context.user.role === "artist" && parsed.data.profileType !== "artist") return apiError("artist_profile_type_required", 403);
  try {
    const profile = await NetworkProfileModel.create({ ...parsed.data, slug: parsed.data.username, userId: auth.context.user._id });
    return Response.json({ ok: true, profile: serializeNetworkProfile(profile) }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) return apiError("username_unavailable", 409);
    throw error;
  }
}

export async function PATCH(req: Request) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const parsed = networkProfileInputSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_profile", 400, parsed.error.flatten());
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.username) update.slug = parsed.data.username;
  if (auth.context.user.role === "artist") {
    delete update.profileType;
    const artist = await CanonicalArtistModel.findOne({ linkedUserId: auth.context.user._id });
    if (!artist) return apiError("artist_not_linked", 409);
    if (parsed.data.username && parsed.data.username !== artist.publicSlug) {
      const collision = await CanonicalArtistModel.exists({ _id: { $ne: artist._id }, shopDomain: artist.shopDomain, publicSlug: parsed.data.username });
      if (collision) return apiError("username_unavailable", 409);
      artist.publicSlug = parsed.data.username; artist.handle = parsed.data.username;
    }
    if (parsed.data.displayName !== undefined) artist.displayName = parsed.data.displayName;
    if (parsed.data.bio !== undefined) artist.bio = parsed.data.bio;
    if (parsed.data.city !== undefined) artist.locationCity = parsed.data.city;
    if (parsed.data.country !== undefined) artist.locationCountry = parsed.data.country;
    if (parsed.data.website !== undefined) artist.websiteUrl = parsed.data.website;
    if (parsed.data.instagram !== undefined) artist.instagram = parsed.data.instagram;
    if (parsed.data.isPublic !== undefined) artist.publicProfile = { ...(artist.publicProfile || {}), isVisible: parsed.data.isPublic };
    if (parsed.data.profileImageUrl !== undefined || parsed.data.coverImageUrl !== undefined) artist.profileImages = { ...(artist.profileImages || {}), ...(parsed.data.profileImageUrl !== undefined ? { avatarUrl: parsed.data.profileImageUrl } : {}), ...(parsed.data.coverImageUrl !== undefined ? { heroUrl: parsed.data.coverImageUrl } : {}) };
    await artist.save();
    for (const key of ["displayName","bio","city","country","website","instagram","profileImageUrl","coverImageUrl"] as const) delete update[key];
  }
  try {
    const profile = await NetworkProfileModel.findOneAndUpdate({ _id: auth.context.profile._id, userId: auth.context.user._id }, { $set: update }, { new: true, runValidators: true });
    if (!profile) return apiError("profile_not_found", 404);
    const unified = await resolveUnifiedProfileBySlug(profile.slug);
    return Response.json({ ok: true, profile: unified || serializeNetworkProfile(profile) });
  } catch (error: any) {
    if (error?.code === 11000) return apiError("username_unavailable", 409);
    throw error;
  }
}
