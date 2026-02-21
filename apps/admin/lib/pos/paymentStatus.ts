import type { TerminalPaymentStatus } from "@/lib/pos/terminalPayments";
import type { PosTransaction } from "@/models/PosTransaction";

type PersistedPosStatus = PosTransaction["status"];

export function isPendingPosStatus(status: PersistedPosStatus) {
  return status === "created" || status === "payment_pending";
}

export function reconcilePosPaymentStatus(
  currentStatus: PersistedPosStatus,
  incomingStatus: TerminalPaymentStatus,
): PersistedPosStatus {
  if (currentStatus === "storno") return "storno";
  if (currentStatus === "refunded") return "refunded";

  if (currentStatus === "paid") {
    return incomingStatus === "refunded" ? "refunded" : "paid";
  }

  if (currentStatus === "failed" || currentStatus === "cancelled") {
    return currentStatus;
  }

  if (incomingStatus === "payment_pending") {
    return "payment_pending";
  }

  return incomingStatus;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function parseIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseWebhookEventIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function appendWebhookEventId(ids: string[], eventId: string) {
  if (!eventId.trim()) return ids;
  const normalized = eventId.trim();
  if (ids.includes(normalized)) return ids;
  return [...ids, normalized].slice(-50);
}
