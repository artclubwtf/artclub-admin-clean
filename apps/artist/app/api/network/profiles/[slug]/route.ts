import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError, connectionState } from "@/lib/server/network-service";
import { ConnectionModel, NetworkEventModel, NetworkPostModel, NetworkProfileModel } from "@/lib/server/models";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { slug } = await params;
  const profile = await NetworkProfileModel.findOne({ slug: slug.toLowerCase(), suspendedAt: { $exists: false } }).lean();
  if (!profile || (!profile.isPublic && String(profile._id) !== String(auth.context.profile._id))) return apiError("profile_not_found", 404);
  const [relation, connectionCount, postCount, eventCount] = await Promise.all([
    connectionState(auth.context.profile._id, profile._id),
    ConnectionModel.countDocuments({ status: "accepted", $or: [{ requesterProfileId: profile._id }, { recipientProfileId: profile._id }] }),
    NetworkPostModel.countDocuments({ authorProfileId: profile._id, status: "published", visibility: "public" }),
    NetworkEventModel.countDocuments({ organizerProfileId: profile._id, status: "published" }),
  ]);
  return Response.json({ ok: true, profile: serializeNetworkProfile(profile), relation: relation ? { id: relation._id.toString(), status: relation.status, requesterProfileId: relation.requesterProfileId.toString() } : null, counts: { connections: connectionCount, posts: postCount, events: eventCount } });
}
