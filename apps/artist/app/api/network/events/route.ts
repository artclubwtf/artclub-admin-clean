import { networkEventInputSchema } from "@artclub/models";
import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { apiError, cursorFilter, EVENT_CREATOR_TYPES } from "@/lib/server/network-service";
import { EventRSVPModel, NetworkEventModel } from "@/lib/server/models";

function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "event"; }
async function eventSlug(title: string) { const base = slugify(title); for (let i = 0; i < 100; i += 1) { const value = i ? `${base}-${i + 1}` : base; if (!(await NetworkEventModel.exists({ slug: value }))) return value; } return `${base}-${Date.now()}`; }
function serializeEvent(item: any, viewerId: unknown, rsvpCount = 0, attending = false) { const organizer = item.organizerProfileId && typeof item.organizerProfileId === "object" && "displayName" in item.organizerProfileId ? item.organizerProfileId : null; return { id: item._id.toString(), title: item.title, slug: item.slug, description: item.description || "", coverImageUrl: item.coverImageUrl || "", startAt: item.startAt, endAt: item.endAt, timezone: item.timezone, venueName: item.venueName || "", address: item.address || "", city: item.city || "", country: item.country || "", isOnline: item.isOnline === true, ticketUrl: item.ticketUrl || "", rsvpEnabled: item.rsvpEnabled !== false, capacity: item.capacity, visibility: item.visibility, status: item.status, participantProfileIds: (item.participantProfileIds || []).map(String), mine: String(organizer?._id || item.organizerProfileId) === String(viewerId), organizer: organizer ? serializeNetworkProfile(organizer) : undefined, rsvpCount, attending }; }

export async function GET(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const url = new URL(req.url); const mode = url.searchParams.get("when") || "upcoming"; const cursor = url.searchParams.get("cursor");
  const dateFilter = mode === "past" ? { $lt: new Date() } : { $gte: new Date() };
  const items = await NetworkEventModel.find({ ...cursorFilter(cursor), status: "published", visibility: "public", startAt: dateFilter }).sort(mode === "past" ? { startAt: -1 } : { startAt: 1 }).limit(31).populate("organizerProfileId", "displayName username slug profileImageUrl profileType isVerified donationEnabled allowsMessages").lean();
  const page = items.slice(0, 30); const ids = page.map((item) => item._id);
  const counts = await EventRSVPModel.aggregate([{ $match: { eventId: { $in: ids }, status: "going" } }, { $group: { _id: "$eventId", count: { $sum: 1 } } }]);
  const mine = await EventRSVPModel.find({ eventId: { $in: ids }, profileId: auth.context.profile._id, status: "going" }).lean(); const countMap = new Map(counts.map((item) => [item._id.toString(), item.count])); const mineSet = new Set(mine.map((item) => item.eventId.toString()));
  return Response.json({ ok: true, events: page.map((item) => serializeEvent(item, auth.context.profile._id, countMap.get(item._id.toString()) || 0, mineSet.has(item._id.toString()))), nextCursor: items.length > 30 ? page.at(-1)?._id.toString() : null });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  if (!EVENT_CREATOR_TYPES.has(auth.context.profile.profileType)) return apiError("event_role_forbidden", 403);
  const parsed = networkEventInputSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return apiError("invalid_event", 400, parsed.error.flatten());
  const item = await NetworkEventModel.create({ ...parsed.data, slug: await eventSlug(parsed.data.title), organizerProfileId: auth.context.profile._id });
  return Response.json({ ok: true, event: serializeEvent(item, auth.context.profile._id) }, { status: 201 });
}
