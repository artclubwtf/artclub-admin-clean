import { Types } from "mongoose";

import { mobileError, mobileNetworkContext, serializeMobileProfile } from "@/lib/mobileNetwork";
import { ConnectionModel, NetworkFollowModel, NetworkNotificationModel, NetworkProfileModel } from "@/models/Network";

export async function GET(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const mode = new URL(req.url).searchParams.get("status") || "accepted"; const id = auth.profile!._id;
  if (mode === "following") { const rows = await NetworkFollowModel.find({ followerProfileId: id }).sort({ createdAt: -1 }).populate("followedProfileId", "displayName username slug profileImageUrl profileType city country").lean(); return Response.json({ ok: true, connections: rows.map((item: any) => ({ id: String(item._id), state: "following", profile: item.followedProfileId ? serializeMobileProfile(item.followedProfileId) : null })) }); }
  const query = mode === "pending" ? { recipientProfileId: id, status: "pending" } : { status: "accepted", $or: [{ requesterProfileId: id }, { recipientProfileId: id }] };
  const rows = await ConnectionModel.find(query).sort({ createdAt: -1 }).populate("requesterProfileId", "displayName username slug profileImageUrl profileType city country").populate("recipientProfileId", "displayName username slug profileImageUrl profileType city country").lean();
  return Response.json({ ok: true, connections: rows.map((item: any) => { const incoming = String(item.recipientProfileId?._id) === String(id); const other = incoming ? item.requesterProfileId : item.recipientProfileId; return { id: String(item._id), state: item.status === "accepted" ? "connected" : incoming ? "incoming_pending" : "outgoing_pending", incoming, profile: other ? serializeMobileProfile(other) : null }; }) });
}

export async function POST(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const body = await req.json().catch(() => null) as { profileId?: string } | null; const profileId = body?.profileId || "";
  if (!Types.ObjectId.isValid(profileId) || profileId === String(auth.profile!._id)) return mobileError("invalid_profile_id"); const recipient = await NetworkProfileModel.findById(profileId); if (!recipient) return mobileError("profile_not_found", 404);
  const pairKey = [String(auth.profile!._id), profileId].sort().join(":"); const existing = await ConnectionModel.findOne({ $or: [{ pairKey }, { requesterProfileId: auth.profile!._id, recipientProfileId: recipient._id }, { requesterProfileId: recipient._id, recipientProfileId: auth.profile!._id }] });
  if (existing?.status === "blocked") return mobileError("connection_blocked", 403);
  const connection = await ConnectionModel.findOneAndUpdate({ _id: existing?._id || new Types.ObjectId() }, { $set: { pairKey, requesterProfileId: auth.profile!._id, recipientProfileId: recipient._id, status: existing?.status === "accepted" ? "accepted" : "pending" }, $unset: { respondedAt: 1 } }, { upsert: true, new: true });
  await NetworkFollowModel.updateOne({ followerProfileId: auth.profile!._id, followedProfileId: recipient._id }, { $setOnInsert: { followerProfileId: auth.profile!._id, followedProfileId: recipient._id } }, { upsert: true });
  if (connection.status === "pending") await NetworkNotificationModel.create({ recipientProfileId: recipient._id, actorProfileId: auth.profile!._id, type: "connection_request", targetType: "connection", targetId: connection._id });
  return Response.json({ ok: true, followed: true, connection: { id: String(connection._id), state: connection.status === "accepted" ? "connected" : "outgoing_pending" } }, { status: 201 });
}
