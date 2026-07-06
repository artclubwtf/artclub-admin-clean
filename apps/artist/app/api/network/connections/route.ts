import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError, connectionState, notify, profilePairKey } from "@/lib/server/network-service";
import { materializeUnifiedProfile } from "@/lib/server/unified-profile";
import { ConnectionModel, NetworkMessageRequestModel } from "@/lib/server/models";
export async function GET(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response; const mode = new URL(req.url).searchParams.get("status") || "accepted";
  const query: any = mode === "pending" ? { recipientProfileId: auth.context.profile._id, status: "pending" } : { status: "accepted", $or: [{ requesterProfileId: auth.context.profile._id }, { recipientProfileId: auth.context.profile._id }] };
  const items = await ConnectionModel.find(query).sort({ createdAt: -1 }).populate("requesterProfileId", "displayName username slug profileImageUrl profileType").populate("recipientProfileId", "displayName username slug profileImageUrl profileType").lean();
  const messages = await NetworkMessageRequestModel.find({ connectionId: { $in: items.map(item=>item._id) }, status: "pending" }).lean(); const messageByConnection = new Map(messages.map(item=>[item.connectionId.toString(),item.text]));
  return Response.json({ ok: true, connections: items.map((item: any) => { const incoming = String(item.recipientProfileId?._id) === String(auth.context.profile._id); const other = incoming ? item.requesterProfileId : item.recipientProfileId; return { id: item._id.toString(), state: item.status === "accepted" ? "connected" : incoming ? "incoming_pending" : "outgoing_pending", incoming, messageRequest: messageByConnection.get(item._id.toString()) || "", profile: other ? serializeNetworkProfile(other) : null, createdAt: item.createdAt }; }) });
}
export async function POST(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response; const body = await req.json().catch(() => null) as { profileId?: string } | null;
  if (!body?.profileId) return apiError("invalid_profile_id"); const recipient = await materializeUnifiedProfile(body.profileId); if (!recipient) return apiError("profile_not_found", 404);
  if (String(recipient._id) === String(auth.context.profile._id)) return apiError("cannot_connect_self", 409);
  const existing = await connectionState(auth.context.profile._id, recipient._id); if (existing?.status === "blocked") return apiError("connection_blocked", 403);
  if (existing?.status === "pending") return Response.json({ ok: true, connection: { id: existing._id.toString(), state: String(existing.requesterProfileId) === String(auth.context.profile._id) ? "outgoing_pending" : "incoming_pending" } });
  if (existing?.status === "accepted") return Response.json({ ok: true, connection: { id: existing._id.toString(), state: "connected" } });
  const pairKey = profilePairKey(auth.context.profile._id, recipient._id);
  try {
    const connection = existing ? await ConnectionModel.findByIdAndUpdate(existing._id, { $set: { pairKey, requesterProfileId: auth.context.profile._id, recipientProfileId: recipient._id, status: "pending" }, $unset: { respondedAt: 1, blockedByProfileId: 1 } }, { new: true }) : await ConnectionModel.create({ pairKey, requesterProfileId: auth.context.profile._id, recipientProfileId: recipient._id, status: "pending" });
    await notify({ recipientProfileId: recipient._id, actorProfileId: auth.context.profile._id, type: "connection_request", targetType: "connection", targetId: connection!._id });
    return Response.json({ ok: true, connection: { id: connection!._id.toString(), state: "outgoing_pending" } }, { status: 201 });
  } catch (error: any) { if (error?.code === 11000) { const connection = await connectionState(auth.context.profile._id, recipient._id); return Response.json({ ok: true, connection: { id: connection?._id.toString(), state: connection?.status === "accepted" ? "connected" : "outgoing_pending" } }); } throw error; }
}
