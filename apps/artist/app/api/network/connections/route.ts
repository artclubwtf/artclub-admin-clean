import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError, connectionState, notify, validId } from "@/lib/server/network-service";
import { ConnectionModel, NetworkProfileModel } from "@/lib/server/models";

export async function GET(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const mode = new URL(req.url).searchParams.get("status") || "accepted";
  const query: Record<string, unknown> = mode === "pending" ? { recipientProfileId: auth.context.profile._id, status: "pending" } : { status: "accepted", $or: [{ requesterProfileId: auth.context.profile._id }, { recipientProfileId: auth.context.profile._id }] };
  const items = await ConnectionModel.find(query).sort({ createdAt: -1 }).populate("requesterProfileId", "displayName username slug profileImageUrl profileType").populate("recipientProfileId", "displayName username slug profileImageUrl profileType").lean();
  return Response.json({ ok: true, connections: items.map((item: any) => { const other = String(item.requesterProfileId?._id) === String(auth.context.profile._id) ? item.recipientProfileId : item.requesterProfileId; return { id: item._id.toString(), status: item.status, incoming: String(item.recipientProfileId?._id) === String(auth.context.profile._id), profile: other ? serializeNetworkProfile(other) : null, createdAt: item.createdAt }; }) });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { profileId?: string } | null;
  if (!validId(body?.profileId)) return apiError("invalid_profile_id");
  if (String(body.profileId) === String(auth.context.profile._id)) return apiError("cannot_connect_self", 409);
  const recipient = await NetworkProfileModel.findOne({ _id: body.profileId, isPublic: true, suspendedAt: { $exists: false } });
  if (!recipient) return apiError("profile_not_found", 404);
  const existing = await connectionState(auth.context.profile._id, recipient._id);
  if (existing?.status === "blocked") return apiError("connection_blocked", 403);
  if (existing?.status === "pending" || existing?.status === "accepted") return Response.json({ ok: true, connection: { id: existing._id.toString(), status: existing.status } });
  const connection = existing
    ? await ConnectionModel.findByIdAndUpdate(existing._id, { $set: { requesterProfileId: auth.context.profile._id, recipientProfileId: recipient._id, status: "pending" }, $unset: { respondedAt: 1, blockedByProfileId: 1 } }, { new: true })
    : await ConnectionModel.create({ requesterProfileId: auth.context.profile._id, recipientProfileId: recipient._id, status: "pending" });
  await notify({ recipientProfileId: recipient._id, actorProfileId: auth.context.profile._id, type: "connection_request", targetType: "connection", targetId: connection!._id });
  return Response.json({ ok: true, connection: { id: connection!._id.toString(), status: connection!.status } }, { status: 201 });
}
