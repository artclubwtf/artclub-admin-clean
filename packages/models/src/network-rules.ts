import type { NetworkProfileType } from "./network";

export function networkSlug(value: string) {
  return value.toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "member";
}

export function canCreateNetworkEvent(profileType: NetworkProfileType, isAdmin = false) {
  return isAdmin || ["artist", "gallery", "event_series", "curator", "institution"].includes(profileType);
}

export function canSendNetworkMessage(input: { sameProfile: boolean; blocked: boolean; connected: boolean; recipientAllowsMessages: boolean; senderIsAdmin?: boolean }) {
  return !input.sameProfile && !input.blocked && (input.senderIsAdmin === true || input.connected || input.recipientAllowsMessages);
}

export function canViewNetworkPost(input: { visibility: "public" | "connections" | "private"; isOwner: boolean; connected: boolean; blocked: boolean }) {
  if (input.blocked) return false;
  return input.isOwner || input.visibility === "public" || (input.visibility === "connections" && input.connected);
}

export function canApplyConnectionAction(input: { status: "pending" | "accepted" | "declined" | "removed" | "blocked"; action: "accept" | "decline" | "remove" | "block"; actorIsRecipient: boolean }) {
  if (input.action === "block") return true;
  if (input.action === "accept" || input.action === "decline") return input.status === "pending" && input.actorIsRecipient;
  return input.status === "accepted";
}

export function donationStatusForStripeEvent(input: { eventType: string; currentStatus: "pending" | "paid" | "failed" | "refunded" | "partially_refunded"; amount?: number; amountRefunded?: number }) {
  if (input.eventType === "payment_intent.succeeded" || input.eventType === "checkout.session.completed") return "paid" as const;
  if (input.eventType === "payment_intent.payment_failed") return input.currentStatus === "paid" ? "paid" as const : "failed" as const;
  if (input.eventType === "charge.refunded") return (input.amountRefunded || 0) >= (input.amount || 0) ? "refunded" as const : "partially_refunded" as const;
  return input.currentStatus;
}

export function networkEngagementRate(input: { likes: number; comments: number; saves: number; shares: number; messageClicks: number; postImpressions: number; profileViews: number }) {
  const numerator = input.likes + input.comments + input.saves + input.shares + input.messageClicks;
  return numerator / Math.max(input.postImpressions + input.profileViews, 1) * 100;
}

export function connectionViewState(input: { status?: "pending" | "accepted" | "declined" | "removed" | "blocked"; requesterId?: string; viewerId: string }) {
  if (!input.status || input.status === "removed") return "none" as const;
  if (input.status === "accepted") return "connected" as const;
  if (input.status === "blocked") return "blocked" as const;
  if (input.status === "declined") return "declined" as const;
  return input.requesterId === input.viewerId ? "outgoing_pending" as const : "incoming_pending" as const;
}

export function stableFeedPage<T extends { id: string; sortDate: string | Date }>(items: T[], cursor: { date: string; key: string } | null, limit: number) {
  const sorted = [...items].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime() || b.id.localeCompare(a.id));
  const cursorTime = cursor ? new Date(cursor.date).getTime() : 0;
  const eligible = cursor ? sorted.filter((item) => { const time = new Date(item.sortDate).getTime(); return time < cursorTime || (time === cursorTime && item.id < cursor.key); }) : sorted;
  return eligible.slice(0, limit);
}

/** Converts a datetime-local value in an IANA timezone into an unambiguous UTC date. */
export function zonedDateTimeToUtc(value: string, timeZone: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value);
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!parts) return new Date(value);
  const desired = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4]), Number(parts[5]), Number(parts[6] || 0));
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const formatted = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((part) => part.type === type)?.value || 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    guess += desired - represented;
  }
  return new Date(guess);
}

export function eventRsvpState(input: { status: string; rsvpEnabled: boolean; endAt?: string | Date | null; startAt: string | Date; capacity?: number | null; rsvpCount: number; alreadyAttending?: boolean; now?: string | Date }) {
  if (input.status !== "published") return "unavailable" as const;
  if (!input.rsvpEnabled) return "disabled" as const;
  const end = new Date(input.endAt || input.startAt).getTime();
  if (end < new Date(input.now || Date.now()).getTime()) return "past" as const;
  if (!input.alreadyAttending && input.capacity && input.rsvpCount >= input.capacity) return "full" as const;
  return input.alreadyAttending ? "attending" as const : "available" as const;
}

export function duplicateKeyFields(error: { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> }) {
  return Array.from(new Set([...Object.keys(error.keyPattern || {}), ...Object.keys(error.keyValue || {})]));
}

export function duplicateRegistrationError(error: { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> }) {
  const fields = duplicateKeyFields(error);
  if (fields.includes("email")) return "email" as const;
  if (fields.includes("slug")) return "slug" as const;
  if (fields.includes("username")) return "username" as const;
  if (fields.includes("userId") || fields.includes("profileId")) return "identity" as const;
  if (fields.includes("registrationAttemptId")) return "attempt" as const;
  if (fields.includes("artistKey")) return "artistKey" as const;
  return "other" as const;
}

export function profileIdentityCandidate(name: string, suffix = 0) {
  const base = networkSlug(name);
  return suffix > 0 ? `${base.slice(0, Math.max(1, 60 - String(suffix + 1).length - 1))}-${suffix + 1}` : base;
}

export function networkOnboardingPath(user: any, profile: any) {
  const confirmed = profile && ["user_selected", "existing_artist_link", "admin_assigned"].includes(profile.profileTypeSource || "");
  if (user.networkRoleSelectionCompleted !== true || !confirmed) return "/onboarding/role";
  if (user.networkOnboardingCompleted !== true || !profile) return "/onboarding/profile";
  return null;
}
