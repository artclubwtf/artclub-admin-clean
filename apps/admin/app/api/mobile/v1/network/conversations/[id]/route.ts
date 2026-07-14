import { Types } from "mongoose";

import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { ConnectionModel, NetworkConversationModel, NetworkReportModel } from "@/models/Network";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const { id } = await params; const body = await req.json().catch(() => null) as { action?: string; muted?: boolean; reason?: string } | null;
  if (!Types.ObjectId.isValid(id)) return mobileError("invalid_conversation_id");
  const conversation = await NetworkConversationModel.findOne({ _id: id, participantProfileIds: auth.profile!._id });
  if (!conversation) return mobileError("conversation_not_found", 404);
  if (body?.action === "mute") {
    await NetworkConversationModel.updateOne({ _id: id }, body.muted === false ? { $pull: { mutedBy: auth.profile!._id } } : { $addToSet: { mutedBy: auth.profile!._id } });
    return Response.json({ ok: true, muted: body.muted !== false });
  }
  const otherId = conversation.participantProfileIds.find((value) => String(value) !== String(auth.profile!._id));
  if (body?.action === "block" && otherId) {
    await ConnectionModel.updateOne({ $or: [{ requesterProfileId: auth.profile!._id, recipientProfileId: otherId }, { requesterProfileId: otherId, recipientProfileId: auth.profile!._id }] }, { $set: { status: "blocked", blockedByProfileId: auth.profile!._id, respondedAt: new Date() } });
    return Response.json({ ok: true, blocked: true });
  }
  if (body?.action === "report") {
    await NetworkReportModel.create({ reporterProfileId: auth.profile!._id, targetType: "message", targetId: conversation._id, reason: ["spam", "harassment", "hate", "nudity", "copyright", "fraud"].includes(body.reason || "") ? body.reason : "other" });
    return Response.json({ ok: true, reported: true }, { status: 201 });
  }
  return mobileError("invalid_action");
}
