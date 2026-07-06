import { connectionActionSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, notify, profilePairKey, validId } from "@/lib/server/network-service";
import { ConnectionModel, NetworkConversationModel, NetworkMessageModel, NetworkMessageRequestModel } from "@/lib/server/models";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response; const { id } = await params; if (!validId(id)) return apiError("invalid_connection_id");
  const parsed = connectionActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return apiError("invalid_action", 400, parsed.error.flatten());
  const relation = await ConnectionModel.findOne({ _id: id, $or: [{ requesterProfileId: auth.context.profile._id }, { recipientProfileId: auth.context.profile._id }] }); if (!relation) return apiError("connection_not_found", 404);
  relation.pairKey ||= profilePairKey(relation.requesterProfileId, relation.recipientProfileId); const incoming = String(relation.recipientProfileId) === String(auth.context.profile._id); const outgoing = String(relation.requesterProfileId) === String(auth.context.profile._id);
  if (["accept", "decline"].includes(parsed.data.action) && (!incoming || relation.status !== "pending")) return apiError("connection_action_forbidden", 403);
  if (parsed.data.action === "cancel" && (!outgoing || relation.status !== "pending")) return apiError("connection_action_forbidden", 403);
  if (parsed.data.action === "accept") {
    relation.status = "accepted"; relation.respondedAt = new Date(); await relation.save();
    const request = await NetworkMessageRequestModel.findOne({ connectionId: relation._id, status: "pending" });
    if (request) { const participantKey = profilePairKey(relation.requesterProfileId, relation.recipientProfileId); const conversation = await NetworkConversationModel.findOneAndUpdate({ participantKey }, { $setOnInsert: { participantKey, participantProfileIds: [relation.requesterProfileId, relation.recipientProfileId] } }, { upsert: true, new: true }); const message = await NetworkMessageModel.create({ conversationId: conversation._id, senderProfileId: request.requesterProfileId, text: request.text, readBy: [request.requesterProfileId] }); conversation.lastMessageAt = message.createdAt; conversation.lastMessagePreview = request.text; await conversation.save(); request.status = "accepted"; request.respondedAt = new Date(); request.conversationId = conversation._id; await request.save(); }
    await notify({ recipientProfileId: relation.requesterProfileId, actorProfileId: auth.context.profile._id, type: "connection_accepted", targetType: "connection", targetId: relation._id });
  } else if (parsed.data.action === "decline") { relation.status = "declined"; relation.respondedAt = new Date(); await relation.save(); await NetworkMessageRequestModel.updateOne({ connectionId: relation._id, status: "pending" }, { $set: { status: "declined", respondedAt: new Date(), cooldownUntil: new Date(Date.now() + 30 * 86400000) } }); await notify({ recipientProfileId: relation.requesterProfileId, actorProfileId: auth.context.profile._id, type: "connection_declined", targetType: "connection", targetId: relation._id }); }
  else if (parsed.data.action === "remove" || parsed.data.action === "cancel") { relation.status = "removed"; relation.respondedAt = new Date(); await relation.save(); }
  else { relation.status = "blocked"; relation.blockedByProfileId = auth.context.profile._id; relation.respondedAt = new Date(); await relation.save(); }
  return Response.json({ ok: true, connection: { id: relation._id.toString(), state: relation.status === "accepted" ? "connected" : relation.status } });
}
