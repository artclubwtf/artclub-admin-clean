import { Types } from "mongoose";

import { mobileError, mobileNetworkContext, serializeMobileProfile } from "@/lib/mobileNetwork";
import { ConnectionModel, NetworkConversationModel, NetworkMessageModel, NetworkProfileModel } from "@/models/Network";

export async function GET(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const id = auth.profile!._id;
  const rows = await NetworkConversationModel.find({ participantProfileIds: id }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100).populate("participantProfileIds", "displayName username slug profileImageUrl profileType city country").lean();
  const unreadRows = await NetworkMessageModel.aggregate([{ $match: { conversationId: { $in: rows.map((item) => item._id) }, senderProfileId: { $ne: id }, readBy: { $ne: id }, deletedAt: { $exists: false } } }, { $group: { _id: "$conversationId", count: { $sum: 1 } } }]); const unread = new Map(unreadRows.map((item) => [String(item._id), item.count]));
  return Response.json({ ok: true, conversations: rows.map((item: any) => { const other = item.participantProfileIds.find((value: any) => String(value._id) !== String(id)); return { id: String(item._id), participant: other ? serializeMobileProfile(other) : null, lastMessageAt: item.lastMessageAt, lastMessagePreview: item.lastMessagePreview || "", unreadCount: unread.get(String(item._id)) || 0 }; }) });
}
export async function POST(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const body = await req.json().catch(() => null) as { profileId?: string } | null; const id = body?.profileId || ""; if (!Types.ObjectId.isValid(id)) return mobileError("invalid_recipient");
  const recipient = await NetworkProfileModel.findById(id); if (!recipient) return mobileError("profile_not_found", 404); const connected = await ConnectionModel.exists({ status: "accepted", $or: [{ requesterProfileId: auth.profile!._id, recipientProfileId: recipient._id }, { requesterProfileId: recipient._id, recipientProfileId: auth.profile!._id }] }); if (!connected) return mobileError("messaging_not_allowed", 403);
  const participantKey = [String(auth.profile!._id), id].sort().join(":"); const conversation = await NetworkConversationModel.findOneAndUpdate({ participantKey }, { $setOnInsert: { participantKey, participantProfileIds: [auth.profile!._id, recipient._id] } }, { upsert: true, new: true }); return Response.json({ ok: true, conversation: { id: String(conversation._id), participant: serializeMobileProfile(recipient) } }, { status: 201 });
}
