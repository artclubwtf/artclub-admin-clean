import { eventRsvpState, zonedDateTimeToUtc } from "@artclub/models";
import { serializeNetworkProfile } from "@/lib/server/network-context";

export function normalizeEventTimes(body: Record<string, unknown>) {
  const timezone = typeof body.timezone === "string" ? body.timezone : "UTC";
  try {
    return {
      ...body,
      ...(typeof body.startAt === "string" ? { startAt: zonedDateTimeToUtc(body.startAt, timezone) } : {}),
      ...(typeof body.endAt === "string" && body.endAt ? { endAt: zonedDateTimeToUtc(body.endAt, timezone) } : body.endAt === "" ? { endAt: undefined } : {}),
    };
  } catch {
    return body;
  }
}

export function serializeEvent(item: any, options: { viewerId: unknown; rsvpCount?: number; attending?: boolean; saved?: boolean } ) {
  const organizer = item.organizerProfileId && typeof item.organizerProfileId === "object" && "displayName" in item.organizerProfileId ? item.organizerProfileId : null;
  const rsvpCount = options.rsvpCount || 0;
  const attending = options.attending === true;
  return {
    id: item._id.toString(),
    title: item.title,
    slug: item.slug,
    description: item.description || "",
    coverImageUrl: item.coverImageUrl || "",
    startAt: item.startAt,
    endAt: item.endAt,
    timezone: item.timezone,
    venueName: item.venueName || "",
    address: item.address || "",
    city: item.city || "",
    country: item.country || "",
    isOnline: item.isOnline === true,
    ticketUrl: item.ticketUrl || "",
    rsvpEnabled: item.rsvpEnabled !== false,
    capacity: item.capacity,
    visibility: item.visibility,
    status: item.status,
    publishedAt: item.publishedAt,
    createdAt: item.createdAt,
    participantProfileIds: (item.participantProfileIds || []).map(String),
    participants: (item.participantProfileIds || []).filter((profile: any) => profile && typeof profile === "object" && "displayName" in profile).map(serializeNetworkProfile),
    organizer: organizer ? serializeNetworkProfile(organizer) : undefined,
    mine: String(organizer?._id || item.organizerProfileId) === String(options.viewerId),
    rsvpCount,
    attending,
    saved: options.saved === true,
    rsvpState: eventRsvpState({ status: item.status, rsvpEnabled: item.rsvpEnabled !== false, startAt: item.startAt, endAt: item.endAt, capacity: item.capacity, rsvpCount, alreadyAttending: attending }),
  };
}
