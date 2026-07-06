import { requireNetworkApiContext } from "@/lib/server/network-context";
import { connectionState } from "@/lib/server/network-service";
import { resolveUnifiedProfileBySlug } from "@/lib/server/unified-profile";
import { apiError } from "@/lib/server/network-service";
import { CanonicalProductModel, ConnectionModel, NetworkEventModel, NetworkFollowModel, NetworkPostModel, NetworkProfileLikeModel } from "@/lib/server/models";
import { connectionViewState } from "@artclub/models";
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response; const { slug } = await params;
  const profile = await resolveUnifiedProfileBySlug(slug); if (!profile || !profile.isPublic) return apiError("profile_not_found", 404);
  const targetId = profile.networkProfileId; const relation = targetId ? await connectionState(auth.context.profile._id, targetId) : null;
  const relationState = connectionViewState({ status: relation?.status, requesterId: relation?.requesterProfileId?.toString(), viewerId: auth.context.profile._id.toString() });
  const [connections, posts, events, artworks, followers, following, likes, followed, liked] = await Promise.all([
    targetId ? ConnectionModel.countDocuments({ status: "accepted", $or: [{ requesterProfileId: targetId }, { recipientProfileId: targetId }] }) : 0,
    targetId ? NetworkPostModel.countDocuments({ authorProfileId: targetId, status: "published", visibility: "public" }) : 0,
    targetId ? NetworkEventModel.countDocuments({ organizerProfileId: targetId, status: "published" }) : 0,
    profile.canonicalArtistId ? CanonicalProductModel.countDocuments({ canonicalArtistId: profile.canonicalArtistId, type: "artwork", status: { $in: ["active", "shopify_synced"] }, approvalStatus: { $in: ["published", "approved"] } }) : 0,
    targetId ? NetworkFollowModel.countDocuments({ followedProfileId: targetId }) : 0, targetId ? NetworkFollowModel.countDocuments({ followerProfileId: targetId }) : 0,
    targetId ? NetworkProfileLikeModel.countDocuments({ likedProfileId: targetId }) : 0,
    targetId ? Boolean(await NetworkFollowModel.exists({ followerProfileId: auth.context.profile._id, followedProfileId: targetId })) : false,
    targetId ? Boolean(await NetworkProfileLikeModel.exists({ likerProfileId: auth.context.profile._id, likedProfileId: targetId })) : false,
  ]);
  return Response.json({ ok: true, profile, relation: relation ? { id: relation._id.toString(), state: relationState } : { state: relationState }, viewer: { mine: profile.userId === auth.context.user._id.toString(), followed, liked }, counts: { connections, posts, events, artworks, followers, following, likes } });
}
