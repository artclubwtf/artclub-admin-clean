import { Types } from "mongoose";

import { mobileNetworkContext, serializeMobileProfile } from "@/lib/mobileNetwork";
import { ConnectionModel, NetworkFollowModel, NetworkProfileLikeModel, NetworkProfileModel } from "@/models/Network";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const { id } = await params;
  const profile = await NetworkProfileModel.findOne({
    ...(Types.ObjectId.isValid(id) ? { _id: id } : { slug: id.toLowerCase() }),
    isPublic: true,
    suspendedAt: { $exists: false },
  }).lean();
  if (!profile) return Response.json({ error: { code: "profile_not_found" } }, { status: 404 });
  const [connection, followed, liked] = await Promise.all([
    ConnectionModel.findOne({ $or: [{ requesterProfileId: auth.profile!._id, recipientProfileId: profile._id }, { requesterProfileId: profile._id, recipientProfileId: auth.profile!._id }] }).lean(),
    NetworkFollowModel.exists({ followerProfileId: auth.profile!._id, followedProfileId: profile._id }),
    NetworkProfileLikeModel.exists({ likerProfileId: auth.profile!._id, likedProfileId: profile._id }),
  ]);
  const incoming = connection && String(connection.recipientProfileId) === String(auth.profile!._id);
  return Response.json({ ok: true, profile: serializeMobileProfile(profile), relationship: { connectionId: connection ? String(connection._id) : null, state: connection?.status === "accepted" ? "connected" : connection?.status === "pending" ? (incoming ? "incoming_pending" : "outgoing_pending") : "none", following: Boolean(followed), liked: Boolean(liked), mine: String(profile._id) === String(auth.profile!._id) } });
}
