import { connectionActionSchema } from "@artclub/models";
import { Types } from "mongoose";

import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { ConnectionModel, NetworkConversationModel, NetworkNotificationModel } from "@/models/Network";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const { id } = await params; if (!Types.ObjectId.isValid(id)) return mobileError("invalid_connection_id");
  const parsed = connectionActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return mobileError("invalid_action");
  const relation = await ConnectionModel.findOne({ _id: id, $or: [{ requesterProfileId: auth.profile!._id }, { recipientProfileId: auth.profile!._id }] }); if (!relation) return mobileError("connection_not_found", 404);
  const incoming = String(relation.recipientProfileId) === String(auth.profile!._id); const outgoing = String(relation.requesterProfileId) === String(auth.profile!._id); const action = parsed.data.action;
  if (["accept", "decline"].includes(action) && (!incoming || relation.status !== "pending")) return mobileError("connection_action_forbidden", 403); if (action === "cancel" && (!outgoing || relation.status !== "pending")) return mobileError("connection_action_forbidden", 403);
  if (action === "accept") { relation.status = "accepted"; relation.respondedAt = new Date(); await relation.save(); const participantKey = [String(relation.requesterProfileId), String(relation.recipientProfileId)].sort().join(":"); await NetworkConversationModel.updateOne({ participantKey }, { $setOnInsert: { participantKey, participantProfileIds: [relation.requesterProfileId, relation.recipientProfileId] } }, { upsert: true }); await NetworkNotificationModel.create({ recipientProfileId: relation.requesterProfileId, actorProfileId: auth.profile!._id, type: "connection_accepted", targetType: "connection", targetId: relation._id }); }
  else if (action === "decline") { relation.status = "declined"; relation.respondedAt = new Date(); await relation.save(); }
  else if (action === "remove" || action === "cancel") { relation.status = "removed"; relation.respondedAt = new Date(); await relation.save(); }
  else { relation.status = "blocked"; relation.blockedByProfileId = auth.profile!._id; relation.respondedAt = new Date(); await relation.save(); }
  return Response.json({ ok: true, connection: { id: String(relation._id), state: relation.status === "accepted" ? "connected" : relation.status } });
}
