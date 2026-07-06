import { networkProfileInputSchema } from "@artclub/models";
import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError } from "@/lib/server/network-service";
import { NetworkProfileModel } from "@/lib/server/models";

export async function GET() {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  return Response.json({ ok: true, profile: serializeNetworkProfile(auth.context.profile) });
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
  if (auth.context.user.role === "artist") delete update.profileType;
  try {
    const profile = await NetworkProfileModel.findOneAndUpdate({ _id: auth.context.profile._id, userId: auth.context.user._id }, { $set: update }, { new: true, runValidators: true });
    if (!profile) return apiError("profile_not_found", 404);
    return Response.json({ ok: true, profile: serializeNetworkProfile(profile) });
  } catch (error: any) {
    if (error?.code === 11000) return apiError("username_unavailable", 409);
    throw error;
  }
}
