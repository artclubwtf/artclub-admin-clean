import { Types } from "mongoose";
import { z } from "zod";

import type {
  ArtistEducationItem,
  ArtistExhibitionItem,
  ArtistExperienceItem,
  ArtistProfileLinkItem,
} from "@/lib/types";

export const profileSectionKeys = ["experience", "education", "exhibitions", "profileLinks"] as const;
export type ArtistProfileSectionKey = (typeof profileSectionKeys)[number];

const dateStringSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "invalid_date");

const optionalUrlSchema = z.string().trim().url().optional().or(z.literal(""));

export const experienceCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    organization: z.string().trim().min(1).max(160),
    employmentType: z.string().trim().max(120).optional().default(""),
    location: z.string().trim().max(160).optional().default(""),
    locationType: z.string().trim().max(120).optional().default(""),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    isCurrent: z.boolean().optional().default(false),
    description: z.string().trim().max(4000).optional().default(""),
    imageUrl: optionalUrlSchema,
  })
  .strict();

export const educationCreateSchema = z
  .object({
    school: z.string().trim().min(1).max(180),
    degree: z.string().trim().max(160).optional().default(""),
    fieldOfStudy: z.string().trim().max(160).optional().default(""),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    grade: z.string().trim().max(80).optional().default(""),
    activities: z.string().trim().max(2000).optional().default(""),
    description: z.string().trim().max(4000).optional().default(""),
    courses: z.string().trim().max(2000).optional().default(""),
    imageUrl: optionalUrlSchema,
  })
  .strict();

export const exhibitionCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    venue: z.string().trim().min(1).max(180),
    exhibitionType: z.string().trim().max(80).optional().default("other"),
    city: z.string().trim().max(120).optional().default(""),
    country: z.string().trim().max(120).optional().default(""),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    isOngoing: z.boolean().optional().default(false),
    description: z.string().trim().max(4000).optional().default(""),
    link: optionalUrlSchema,
    coverImageUrl: optionalUrlSchema,
    visibility: z.enum(["public", "private"]).optional().default("public"),
  })
  .strict();

export const profileLinkCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    url: z.string().trim().url(),
    type: z.string().trim().max(60).optional().default("custom"),
    isVisible: z.boolean().optional().default(true),
    isHighlighted: z.boolean().optional().default(false),
  })
  .strict();

export const reorderSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export function toDateInputValue(value: Date | string | undefined | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function sortBySortOrder<T extends { sortOrder?: number }>(items: T[]) {
  return [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function nextSortOrder(items: Array<{ sortOrder?: number }>) {
  return items.reduce((max, item) => Math.max(max, item.sortOrder || 0), -1) + 1;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function serializeExperience(items: any[] | undefined): ArtistExperienceItem[] {
  return sortBySortOrder((items || []).map((item, index) => ({
    id: normalizeString(item?.id) || `exp-${index}`,
    title: normalizeString(item?.title),
    organization: normalizeString(item?.organization),
    employmentType: normalizeString(item?.employmentType),
    location: normalizeString(item?.location),
    locationType: normalizeString(item?.locationType),
    startDate: toDateInputValue(item?.startDate),
    endDate: toDateInputValue(item?.endDate),
    isCurrent: item?.isCurrent === true,
    description: normalizeString(item?.description),
    imageUrl: normalizeString(item?.imageUrl),
    sortOrder: typeof item?.sortOrder === "number" ? item.sortOrder : index,
  })));
}

export function serializeEducation(items: any[] | undefined): ArtistEducationItem[] {
  return sortBySortOrder((items || []).map((item, index) => ({
    id: normalizeString(item?.id) || `edu-${index}`,
    school: normalizeString(item?.school),
    degree: normalizeString(item?.degree),
    fieldOfStudy: normalizeString(item?.fieldOfStudy),
    startDate: toDateInputValue(item?.startDate),
    endDate: toDateInputValue(item?.endDate),
    grade: normalizeString(item?.grade),
    activities: normalizeString(item?.activities),
    description: normalizeString(item?.description),
    courses: normalizeString(item?.courses),
    imageUrl: normalizeString(item?.imageUrl),
    sortOrder: typeof item?.sortOrder === "number" ? item.sortOrder : index,
  })));
}

export function serializeExhibitions(items: any[] | undefined): ArtistExhibitionItem[] {
  return sortBySortOrder((items || []).map((item, index) => ({
    id: normalizeString(item?.id) || `exh-${index}`,
    title: normalizeString(item?.title),
    venue: normalizeString(item?.venue),
    exhibitionType: normalizeString(item?.exhibitionType) || "other",
    city: normalizeString(item?.city),
    country: normalizeString(item?.country),
    startDate: toDateInputValue(item?.startDate),
    endDate: toDateInputValue(item?.endDate),
    isOngoing: item?.isOngoing === true,
    description: normalizeString(item?.description),
    link: normalizeString(item?.link),
    coverImageUrl: normalizeString(item?.coverImageUrl),
    sortOrder: typeof item?.sortOrder === "number" ? item.sortOrder : index,
    visibility: item?.visibility === "private" ? "private" : "public",
  })));
}

export function serializeProfileLinks(items: any[] | undefined): ArtistProfileLinkItem[] {
  return sortBySortOrder((items || []).map((item, index) => ({
    id: normalizeString(item?.id) || `link-${index}`,
    label: normalizeString(item?.label),
    url: normalizeString(item?.url),
    type: normalizeString(item?.type) || "custom",
    sortOrder: typeof item?.sortOrder === "number" ? item.sortOrder : index,
    isVisible: item?.isVisible !== false,
    isHighlighted: item?.isHighlighted === true,
  })));
}

export function createExperienceEntry(input: z.infer<typeof experienceCreateSchema>, currentItems: any[]) {
  return {
    id: new Types.ObjectId().toString(),
    title: input.title,
    organization: input.organization,
    employmentType: input.employmentType || undefined,
    location: input.location || undefined,
    locationType: input.locationType || undefined,
    startDate: parseDateInput(input.startDate || undefined),
    endDate: input.isCurrent ? undefined : parseDateInput(input.endDate || undefined),
    isCurrent: input.isCurrent,
    description: input.description || undefined,
    imageUrl: input.imageUrl || undefined,
    sortOrder: nextSortOrder(currentItems),
  };
}

export function createEducationEntry(input: z.infer<typeof educationCreateSchema>, currentItems: any[]) {
  return {
    id: new Types.ObjectId().toString(),
    school: input.school,
    degree: input.degree || undefined,
    fieldOfStudy: input.fieldOfStudy || undefined,
    startDate: parseDateInput(input.startDate || undefined),
    endDate: parseDateInput(input.endDate || undefined),
    grade: input.grade || undefined,
    activities: input.activities || undefined,
    description: input.description || undefined,
    courses: input.courses || undefined,
    imageUrl: input.imageUrl || undefined,
    sortOrder: nextSortOrder(currentItems),
  };
}

export function createExhibitionEntry(input: z.infer<typeof exhibitionCreateSchema>, currentItems: any[]) {
  return {
    id: new Types.ObjectId().toString(),
    title: input.title,
    venue: input.venue,
    exhibitionType: input.exhibitionType || "other",
    city: input.city || undefined,
    country: input.country || undefined,
    startDate: parseDateInput(input.startDate || undefined),
    endDate: input.isOngoing ? undefined : parseDateInput(input.endDate || undefined),
    isOngoing: input.isOngoing,
    description: input.description || undefined,
    link: input.link || undefined,
    coverImageUrl: input.coverImageUrl || undefined,
    sortOrder: nextSortOrder(currentItems),
    visibility: input.visibility,
  };
}

export function createProfileLinkEntry(input: z.infer<typeof profileLinkCreateSchema>, currentItems: any[]) {
  return {
    id: new Types.ObjectId().toString(),
    label: input.label,
    url: input.url,
    type: input.type || "custom",
    sortOrder: nextSortOrder(currentItems),
    isVisible: input.isVisible !== false,
    isHighlighted: input.isHighlighted === true,
  };
}

export function reorderItems<T extends { id: string; sortOrder: number }>(items: T[], ids: string[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next = ids.map((id) => byId.get(id)).filter(Boolean) as T[];
  const remaining = items.filter((item) => !ids.includes(item.id));
  return [...next, ...remaining].map((item, index) => ({ ...item, sortOrder: index }));
}

export function isUpcomingOrOngoingExhibition(item: Pick<ArtistExhibitionItem, "startDate" | "endDate" | "isOngoing">) {
  if (item.isOngoing) return true;
  const now = new Date();
  const start = item.startDate ? new Date(item.startDate) : null;
  const end = item.endDate ? new Date(item.endDate) : null;
  if (end && end.getTime() >= now.getTime()) return true;
  if (start && start.getTime() >= now.getTime()) return true;
  return false;
}
