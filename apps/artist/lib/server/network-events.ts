import { eventRsvpState, zonedDateTimeToUtc } from "@artclub/models";
import { serializeNetworkProfile } from "@/lib/server/network-context";
import { resolveNetworkMediaForRead } from "@/lib/server/network-media";

export type NetworkEventWhen = "upcoming" | "past" | "all";

export function parseOptionalDate(value: string | null): Date | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildEventStartAtFilter(input: { when: NetworkEventWhen; from: string | null; to: string | null; now?: Date }) {
  const fromProvided = Boolean(input.from?.trim());
  const toProvided = Boolean(input.to?.trim());
  const from = parseOptionalDate(input.from);
  const to = parseOptionalDate(input.to);
  if (fromProvided && !from) return { ok: false as const, error: "invalid_from_date" };
  if (toProvided && !to) return { ok: false as const, error: "invalid_to_date" };
  if (from && to && from > to) return { ok: false as const, error: "invalid_date_range" };

  const now = input.now || new Date();
  const filter: Record<string, Date | string> = { $type: "date" };
  if (from) filter.$gte = from;
  else if (input.when === "upcoming") filter.$gte = now;
  if (to) filter.$lte = to;
  else if (input.when === "past") filter.$lt = now;
  return input.when === "all" && !from && !to
    ? { ok: true as const, filter: undefined }
    : { ok: true as const, filter };
}

export function buildEventStartAtConstraint(filter: Record<string, Date | string> | undefined, includeUndatedDrafts: boolean) {
  if (filter) return { startAt: filter };
  if (!includeUndatedDrafts) return { startAt: { $type: "date" } };
  return { $or: [{ startAt: { $type: "date" } }, { startAt: { $exists: false } }, { startAt: null }] };
}

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
    coverImageUrl: resolveNetworkMediaForRead(item.coverImageUrl, item.coverImageStorageKey),
    coverImageStorageKey: item.coverImageStorageKey || "",
    coverOriginalUrl: resolveNetworkMediaForRead(item.coverOriginalUrl, item.coverOriginalStorageKey),
    coverOriginalStorageKey: item.coverOriginalStorageKey || "",
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
