import { connectionActionSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, notify, validId } from "@/lib/server/network-service";
import { ConnectionModel } from "@/lib/server/models";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_connection_id");
  const parsed = connectionActionSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return apiError("invalid_action", 400, parsed.error.flatten());
  const relation = await ConnectionModel.findOne({ _id: id, $or: [{ requesterProfileId: auth.context.profile._id }, { recipientProfileId: auth.context.profile._id }] });
  if (!relation) return apiError("connection_not_found", 404);
  const isRecipient = String(relation.recipientProfileId) === String(auth.context.profile._id);
  if (["accept", "decline"].includes(parsed.data.action) && (!isRecipient || relation.status !== "pending")) return apiError("connection_action_forbidden", 403);
  if (parsed.data.action === "accept") {
    relation.status = "accepted"; relation.respondedAt = new Date(); await relation.save();
    await notify({ recipientProfileId: relation.requesterProfileId, actorProfileId: auth.context.profile._id, type: "connection_accepted", targetType: "connection", targetId: relation._id });
  } else if (parsed.data.action === "decline") { relation.status = "declined"; relation.respondedAt = new Date(); await relation.save(); }
  else if (parsed.data.action === "remove") { relation.status = "removed"; relation.respondedAt = new Date(); await relation.save(); }
  else { relation.status = "blocked"; relation.blockedByProfileId = auth.context.profile._id; relation.respondedAt = new Date(); await relation.save(); }
  return Response.json({ ok: true, connection: { id: relation._id.toString(), status: relation.status } });
}
