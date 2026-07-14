import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, validId } from "@/lib/server/network-service";
import { NetworkConversationModel } from "@/lib/server/models";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_conversation_id");
  const body = await req.json().catch(() => null) as { action?: string } | null;
  if (!body || !["mute", "unmute"].includes(body.action || "")) return apiError("invalid_conversation_action");
  const update = body.action === "mute" ? { $addToSet: { mutedBy: auth.context.profile._id } } : { $pull: { mutedBy: auth.context.profile._id } };
  const conversation = await NetworkConversationModel.findOneAndUpdate({ _id: id, participantProfileIds: auth.context.profile._id }, update, { new: true });
  if (!conversation) return apiError("conversation_not_found", 404);
  return Response.json({ ok: true, muted: body.action === "mute" });
}
