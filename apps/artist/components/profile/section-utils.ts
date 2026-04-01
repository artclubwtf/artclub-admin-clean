"use client";

import type { ArtistMediaItem } from "@/lib/types";

export function asSingleMedia(url: string, kind: ArtistMediaItem["kind"], filename = "Current image"): ArtistMediaItem[] {
  return url ? [{ id: "", kind, url, previewUrl: url, filename }] : [];
}

export function formatMonthYear(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

export function formatDateRange(startDate: string, endDate: string, isCurrent: boolean, currentLabel: string) {
  const start = formatMonthYear(startDate);
  const end = isCurrent ? currentLabel : formatMonthYear(endDate);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;
  return `${start} - ${end}`;
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function toReorderIds<T extends { id: string }>(items: T[]) {
  return items.map((item) => item.id);
}

export function summarizeHost(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return url;
  }
}

export function isUpcomingOrOngoingDateRange(input: { startDate: string; endDate: string; isOngoing: boolean }) {
  if (input.isOngoing) return true;
  const now = Date.now();
  const start = input.startDate ? Date.parse(input.startDate) : null;
  const end = input.endDate ? Date.parse(input.endDate) : null;
  if (end && end >= now) return true;
  if (start && start >= now) return true;
  return false;
}
