import { networkOnboardingRoleSchema } from "@artclub/models";
import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { ensureExistingArtistNetworkIdentity } from "@/lib/server/network-onboarding";
import { apiError } from "@/lib/server/network-service";
import { NetworkProfileModel, UserModel } from "@/lib/server/models";

export async function GET() {
  const auth = await requireNetworkApiContext({ allowMissingProfile: true }); if (!auth.ok) return auth.response;
  const linked = await ensureExistingArtistNetworkIdentity(auth.context.user);
  if (linked) return Response.json({ ok: true, profileType: "artist", autoDetected: true, profile: serializeNetworkProfile(linked.profile) });
  const profile = auth.context.profile;
  return Response.json({ ok: true, profileType: auth.context.user.networkRoleSelectionCompleted ? auth.context.user.networkProfileType : null, autoDetected: false, profile: profile ? serializeNetworkProfile(profile) : null });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext({ allowMissingProfile: true }); if (!auth.ok) return auth.response;
  const linked = await ensureExistingArtistNetworkIdentity(auth.context.user);
  if (linked) return Response.json({ ok: true, profileType: "artist", autoDetected: true, next: "/onboarding/profile" });
  const parsed = networkOnboardingRoleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_profile_type", 400, parsed.error.flatten());
  await UserModel.updateOne({ _id: auth.context.user._id }, { $set: { networkProfileType: parsed.data.profileType, networkRoleSelectionCompleted: true, networkOnboardingCompleted: false } });
  if (auth.context.profile) await NetworkProfileModel.updateOne({ _id: auth.context.profile._id, userId: auth.context.user._id }, { $set: { profileType: parsed.data.profileType, profileTypeSource: "user_selected" } });
  return Response.json({ ok: true, profileType: parsed.data.profileType, autoDetected: false, next: "/onboarding/profile" });
}
