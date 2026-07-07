import { networkEventInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { normalizeEventTimes, serializeEvent } from "@/lib/server/network-events";
import { apiError, validId } from "@/lib/server/network-service";
import { EventRSVPModel, NetworkEventModel, SavedEventModel } from "@/lib/server/models";
import { hydrateNetworkMediaKeys } from "@/lib/server/network-media";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_event_id");
  const event = await NetworkEventModel.findOne({ _id: id, $or: [{ status: { $in: ["published", "cancelled"] }, visibility: "public" }, { organizerProfileId: auth.context.profile._id }] })
    .populate("organizerProfileId", "displayName username slug profileImageUrl profileType isVerified donationEnabled allowsMessages")
    .populate("participantProfileIds", "displayName username slug profileImageUrl profileType isVerified").lean();
  if (!event) return apiError("event_not_found", 404);
  const [count, attending, saved] = await Promise.all([
    EventRSVPModel.countDocuments({ eventId: id, status: "going" }),
    EventRSVPModel.exists({ eventId: id, profileId: auth.context.profile._id, status: "going" }),
    SavedEventModel.exists({ eventId: id, profileId: auth.context.profile._id }),
  ]);
  return Response.json({ ok: true, event: serializeEvent(event, { viewerId: auth.context.profile._id, rsvpCount: count, attending: Boolean(attending), saved: Boolean(saved) }) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_event_id");
  const current = await NetworkEventModel.findOne({ _id: id, organizerProfileId: auth.context.profile._id });
  if (!current) return apiError("event_not_found", 404);
  if (["cancelled", "completed"].includes(current.status)) return apiError("event_not_editable", 409);
  const body = normalizeEventTimes(hydrateNetworkMediaKeys(await req.json().catch(() => ({}))));
  const parsed = networkEventInputSchema.safeParse({ title: current.title, description: current.description || "", coverImageUrl: current.coverImageUrl || "", coverImageStorageKey: current.coverImageStorageKey || "", coverOriginalUrl: current.coverOriginalUrl || "", coverOriginalStorageKey: current.coverOriginalStorageKey || "", startAt: current.startAt, endAt: current.endAt, timezone: current.timezone, venueName: current.venueName || "", address: current.address || "", city: current.city || "", country: current.country || "", isOnline: current.isOnline, ticketUrl: current.ticketUrl || "", rsvpEnabled: current.rsvpEnabled, capacity: current.capacity, visibility: current.visibility, participantProfileIds: current.participantProfileIds.map(String), status: current.status === "published" ? "published" : "draft", ...body });
  if (!parsed.success) return apiError("invalid_event", 400, parsed.error.flatten());
  const publishing = current.status !== "published" && parsed.data.status === "published";
  Object.assign(current, parsed.data, publishing ? { publishedAt: new Date() } : {});
  await current.save();
  return Response.json({ ok: true, event: serializeEvent(current, { viewerId: auth.context.profile._id }) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_event_id");
  const event = await NetworkEventModel.findOne({ _id: id, organizerProfileId: auth.context.profile._id });
  if (!event) return apiError("event_not_found", 404);
  if (event.status === "published") { event.status = "cancelled"; await event.save(); }
  else await event.deleteOne();
  return Response.json({ ok: true, status: event.status === "cancelled" ? "cancelled" : "deleted" });
}
