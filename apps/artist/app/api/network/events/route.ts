import { networkEventInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { normalizeEventTimes, serializeEvent } from "@/lib/server/network-events";
import { apiError, cursorFilter, EVENT_CREATOR_TYPES } from "@/lib/server/network-service";
import { EventRSVPModel, NetworkEventModel, SavedEventModel } from "@/lib/server/models";

function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "event"; }
async function eventSlug(title: string) { const base = slugify(title); for (let i = 0; i < 100; i += 1) { const value = i ? `${base}-${i + 1}` : base; if (!(await NetworkEventModel.exists({ slug: value }))) return value; } return `${base}-${Date.now()}`; }
export async function GET(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const url = new URL(req.url); const mode = url.searchParams.get("when") || "upcoming"; const cursor = url.searchParams.get("cursor"); const scope = url.searchParams.get("scope"); const profileId = url.searchParams.get("profileId");
  const dateFilter = mode === "past" ? { $lt: new Date() } : mode === "all" ? {} : { $gte: new Date() };
  const ownership = scope === "mine" ? { organizerProfileId: auth.context.profile._id } : profileId && /^[a-f\d]{24}$/i.test(profileId) ? { $or: [{ organizerProfileId: profileId }, { participantProfileIds: profileId }] } : {};
  const access = scope === "mine" ? {} : { status: { $in: ["published", "cancelled"] }, visibility: "public" };
  const items = await NetworkEventModel.find({ ...cursorFilter(cursor), ...access, ...ownership, startAt: dateFilter }).sort(mode === "upcoming" ? { startAt: 1 } : { startAt: -1 }).limit(31).populate("organizerProfileId", "displayName username slug profileImageUrl profileType isVerified donationEnabled allowsMessages").populate("participantProfileIds", "displayName username slug profileImageUrl profileType isVerified").lean();
  const page = items.slice(0, 30); const ids = page.map((item) => item._id);
  const counts = await EventRSVPModel.aggregate([{ $match: { eventId: { $in: ids }, status: "going" } }, { $group: { _id: "$eventId", count: { $sum: 1 } } }]);
  const [mine, saved] = await Promise.all([EventRSVPModel.find({ eventId: { $in: ids }, profileId: auth.context.profile._id, status: "going" }).lean(), SavedEventModel.find({ eventId: { $in: ids }, profileId: auth.context.profile._id }).lean()]); const countMap = new Map(counts.map((item) => [item._id.toString(), item.count])); const mineSet = new Set(mine.map((item) => item.eventId.toString())); const savedSet = new Set(saved.map((item) => item.eventId.toString()));
  return Response.json({ ok: true, events: page.map((item) => serializeEvent(item, { viewerId: auth.context.profile._id, rsvpCount: countMap.get(item._id.toString()) || 0, attending: mineSet.has(item._id.toString()), saved: savedSet.has(item._id.toString()) })), nextCursor: items.length > 30 ? page.at(-1)?._id.toString() : null });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  if (!EVENT_CREATOR_TYPES.has(auth.context.profile.profileType)) return apiError("event_role_forbidden", 403);
  const body = await req.json().catch(() => null); const parsed = networkEventInputSchema.safeParse(normalizeEventTimes(body || {})); if (!parsed.success) return apiError("invalid_event", 400, parsed.error.flatten());
  const item = await NetworkEventModel.create({ ...parsed.data, ...(parsed.data.status === "published" ? { publishedAt: new Date() } : {}), slug: await eventSlug(parsed.data.title), organizerProfileId: auth.context.profile._id });
  return Response.json({ ok: true, event: serializeEvent(item, { viewerId: auth.context.profile._id }) }, { status: 201 });
}
