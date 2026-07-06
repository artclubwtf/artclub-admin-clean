import { networkMessageInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, canMessage, cursorFilter, notify, validId } from "@/lib/server/network-service";
import { NetworkConversationModel, NetworkMessageModel, NetworkProfileModel } from "@/lib/server/models";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_conversation_id");
  const conversation = await NetworkConversationModel.findOne({ _id: id, participantProfileIds: auth.context.profile._id }).lean(); if (!conversation) return apiError("conversation_not_found", 404);
  const cursor = new URL(req.url).searchParams.get("cursor");
  const messages = await NetworkMessageModel.find({ conversationId: id, deletedAt: { $exists: false }, ...cursorFilter(cursor) }).sort({ _id: -1 }).limit(51).lean();
  const page = messages.slice(0, 50);
  return Response.json({ ok: true, messages: page.reverse().map((message) => ({ id: message._id.toString(), text: message.text || "", media: message.media || [], mine: String(message.senderProfileId) === String(auth.context.profile._id), read: message.readBy.some((value) => String(value) !== String(message.senderProfileId)), createdAt: message.createdAt, editedAt: message.editedAt })), nextCursor: messages.length > 50 ? messages[49]._id.toString() : null });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_conversation_id");
  const parsed = networkMessageInputSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return apiError("invalid_message", 400, parsed.error.flatten());
  const conversation = await NetworkConversationModel.findOne({ _id: id, participantProfileIds: auth.context.profile._id }); if (!conversation) return apiError("conversation_not_found", 404);
  const recipientId = conversation.participantProfileIds.find((value) => String(value) !== String(auth.context.profile._id));
  const recipient = recipientId ? await NetworkProfileModel.findById(recipientId) : null; if (!recipient || !(await canMessage(auth.context.profile, recipient))) return apiError("messaging_not_allowed", 403);
  const recentCount = await NetworkMessageModel.countDocuments({ senderProfileId: auth.context.profile._id, createdAt: { $gte: new Date(Date.now() - 60_000) } });
  if (recentCount >= 30) return apiError("rate_limited", 429);
  const message = await NetworkMessageModel.create({ conversationId: conversation._id, senderProfileId: auth.context.profile._id, text: parsed.data.text, media: parsed.data.media, readBy: [auth.context.profile._id] });
  conversation.lastMessageAt = message.createdAt; conversation.lastMessagePreview = parsed.data.text.slice(0, 160) || (parsed.data.media[0]?.type === "image" ? "Image" : "Video"); await conversation.save();
  await notify({ recipientProfileId: recipient._id, actorProfileId: auth.context.profile._id, type: "new_message", targetType: "conversation", targetId: conversation._id });
  return Response.json({ ok: true, message: { id: message._id.toString(), text: message.text || "", media: message.media || [], mine: true, read: false, createdAt: message.createdAt } }, { status: 201 });
}
