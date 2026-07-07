import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, validId } from "@/lib/server/network-service";
import { NetworkEventModel, SavedEventModel } from "@/lib/server/models";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_event_id");
  if (!await NetworkEventModel.exists({ _id: id, status: { $in: ["published", "cancelled"] }, visibility: "public" })) return apiError("event_not_found", 404);
  await SavedEventModel.updateOne({ eventId: id, profileId: auth.context.profile._id }, { $setOnInsert: { eventId: id, profileId: auth.context.profile._id } }, { upsert: true });
  return Response.json({ ok: true, saved: true });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_event_id");
  await SavedEventModel.deleteOne({ eventId: id, profileId: auth.context.profile._id });
  return Response.json({ ok: true, saved: false });
}
