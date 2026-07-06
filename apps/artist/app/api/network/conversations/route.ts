import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError, canMessage, validId } from "@/lib/server/network-service";
import { NetworkConversationModel, NetworkMessageModel, NetworkProfileModel } from "@/lib/server/models";
import { materializeUnifiedProfile } from "@/lib/server/unified-profile";

export async function GET(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  const conversations = await NetworkConversationModel.find({ participantProfileIds: auth.context.profile._id }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100).populate("participantProfileIds", "displayName username slug profileImageUrl profileType").lean();
  const filtered = conversations.filter((item: any) => !q || item.participantProfileIds.some((profile: any) => String(profile._id) !== String(auth.context.profile._id) && `${profile.displayName} ${profile.username}`.toLowerCase().includes(q)));
  const ids = filtered.map((item) => item._id);
  const unread = await NetworkMessageModel.aggregate([{ $match: { conversationId: { $in: ids }, senderProfileId: { $ne: auth.context.profile._id }, readBy: { $ne: auth.context.profile._id }, deletedAt: { $exists: false } } }, { $group: { _id: "$conversationId", count: { $sum: 1 } } }]);
  const unreadMap = new Map(unread.map((item) => [item._id.toString(), item.count]));
  return Response.json({ ok: true, conversations: filtered.map((item: any) => { const other = item.participantProfileIds.find((profile: any) => String(profile._id) !== String(auth.context.profile._id)); return { id: item._id.toString(), participant: other ? serializeNetworkProfile(other) : null, lastMessageAt: item.lastMessageAt, lastMessagePreview: item.lastMessagePreview || "", unreadCount: unreadMap.get(item._id.toString()) || 0 }; }) });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { profileId?: string } | null;
  if (!body?.profileId) return apiError("invalid_recipient");
  const recipient = await materializeUnifiedProfile(body.profileId);
  if (String(recipient?._id) === String(auth.context.profile._id)) return apiError("invalid_recipient");
  if (!recipient) return apiError("profile_not_found", 404);
  if (!(await canMessage(auth.context.profile, recipient))) return apiError("messaging_not_allowed", 403);
  const participantKey = [auth.context.profile._id.toString(), recipient._id.toString()].sort().join(":");
  const conversation = await NetworkConversationModel.findOneAndUpdate({ participantKey }, { $setOnInsert: { participantKey, participantProfileIds: [auth.context.profile._id, recipient._id] } }, { upsert: true, new: true });
  return Response.json({ ok: true, conversation: { id: conversation._id.toString(), participant: serializeNetworkProfile(recipient) } }, { status: 201 });
}
