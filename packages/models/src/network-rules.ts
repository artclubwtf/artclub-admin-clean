import type { NetworkProfileType } from "./network";

export function networkSlug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "member";
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
