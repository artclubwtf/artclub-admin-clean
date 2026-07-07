import { eventRsvpState } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, notify, validId } from "@/lib/server/network-service";
import { EventRSVPModel, NetworkEventModel } from "@/lib/server/models";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_event_id");
  const event = await NetworkEventModel.findById(id); if (!event) return apiError("event_not_found", 404);
  const existing = await EventRSVPModel.exists({ eventId: id, profileId: auth.context.profile._id, status: "going" });
  const count = await EventRSVPModel.countDocuments({ eventId: id, status: "going" });
  const state = eventRsvpState({ status: event.status, rsvpEnabled: event.rsvpEnabled !== false, startAt: event.startAt, endAt: event.endAt, capacity: event.capacity, rsvpCount: count, alreadyAttending: Boolean(existing) });
  if (!["available", "attending"].includes(state)) return apiError(`event_${state}`, state === "full" ? 409 : 400);
  if (!existing) {
    await EventRSVPModel.updateOne({ eventId: id, profileId: auth.context.profile._id }, { $set: { status: "going" } }, { upsert: true });
    await notify({ recipientProfileId: event.organizerProfileId, actorProfileId: auth.context.profile._id, type: "event_rsvp", targetType: "event", targetId: event._id });
  }
  return Response.json({ ok: true, attending: true, rsvpCount: count + (existing ? 0 : 1) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_event_id");
  const result = await EventRSVPModel.updateOne({ eventId: id, profileId: auth.context.profile._id, status: "going" }, { $set: { status: "cancelled" } });
  const count = await EventRSVPModel.countDocuments({ eventId: id, status: "going" });
  return Response.json({ ok: true, attending: false, changed: result.modifiedCount > 0, rsvpCount: count });
}
