import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, validId } from "@/lib/server/network-service";
import { NetworkConversationModel, NetworkMessageModel } from "@/lib/server/models";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_conversation_id");
  if (!(await NetworkConversationModel.exists({ _id: id, participantProfileIds: auth.context.profile._id }))) return apiError("conversation_not_found", 404);
  await NetworkMessageModel.updateMany({ conversationId: id, senderProfileId: { $ne: auth.context.profile._id }, readBy: { $ne: auth.context.profile._id } }, { $addToSet: { readBy: auth.context.profile._id } });
  return Response.json({ ok: true });
}
