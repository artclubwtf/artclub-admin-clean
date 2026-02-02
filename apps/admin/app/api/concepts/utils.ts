import { NextResponse } from "next/server";
import { Types } from "mongoose";

import type { Concept } from "@/models/Concept";
import {
  conceptAssetKinds,
  conceptExportProviders,
  conceptGranularities,
  conceptReferenceSources,
  conceptStatuses,
  conceptTypes,
} from "@/models/Concept";

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function isValidObjectId(id: string) {
  return Types.ObjectId.isValid(id);
}

export function parseEnum<T extends readonly string[]>(value: unknown, allowed: T) {
  return typeof value === "string" && allowed.includes(value as (typeof allowed)[number]) ? (value as (typeof allowed)[number]) : null;
}

export function parseString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function parseSections(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const { goalContext, targetAudience, narrative, kpis, legal, extra } = value as Record<string, unknown>;
  const sections: Record<string, unknown> = {};
  if (typeof goalContext === "string") sections.goalContext = goalContext;
  if (typeof targetAudience === "string") sections.targetAudience = targetAudience;
  if (typeof narrative === "string") sections.narrative = narrative;
  if (typeof kpis === "string") sections.kpis = kpis;
  if (typeof legal === "string") sections.legal = legal;
  if (extra && typeof extra === "object") sections.extra = extra;
  return sections;
}

type ArtistRef = { source: (typeof conceptReferenceSources)[number]; id: string; label?: string };
type ArtworkRef = { productId: string; label?: string };
type CollectionRef = { id: string; title?: string };

export function parseReferences(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const { artists, artworks, collections } = value as Record<string, unknown>;
  const result: {
    artists?: ArtistRef[];
    artworks?: ArtworkRef[];
    collections?: CollectionRef[];
  } = {};

  if (Array.isArray(artists)) {
    const parsed: ArtistRef[] = [];
    for (const entry of artists) {
      if (!entry || typeof entry !== "object") continue;
      const { source, id, label } = entry as Record<string, unknown>;
      const parsedSource = parseEnum(source, conceptReferenceSources);
      if (!parsedSource || typeof id !== "string") continue;
      parsed.push({ source: parsedSource, id, label: typeof label === "string" ? label : undefined });
    }
    result.artists = parsed;
  }

  if (Array.isArray(artworks)) {
    const parsed: ArtworkRef[] = [];
    for (const entry of artworks) {
      if (!entry || typeof entry !== "object") continue;
      const { productId, label } = entry as Record<string, unknown>;
      if (typeof productId !== "string") continue;
      parsed.push({ productId, label: typeof label === "string" ? label : undefined });
    }
    result.artworks = parsed;
  }

  if (Array.isArray(collections)) {
    const parsed: CollectionRef[] = [];
    for (const entry of collections) {
      if (!entry || typeof entry !== "object") continue;
      const { id, title } = entry as Record<string, unknown>;
      if (typeof id !== "string") continue;
      parsed.push({ id, title: typeof title === "string" ? title : undefined });
    }
    result.collections = parsed;
  }

  return result;
}

export type AssetInput = {
  kind: (typeof conceptAssetKinds)[number];
  id?: string;
  url?: string;
  mimeType?: string;
  label?: string;
  previewUrl?: string;
};

export function parseAssets(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const assets: AssetInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { kind, id, url, mimeType, label, previewUrl } = entry as Record<string, unknown>;
    const parsedKind = parseEnum(kind, conceptAssetKinds);
    if (!parsedKind) continue;
    assets.push({
      kind: parsedKind,
      id: typeof id === "string" ? id : undefined,
      url: typeof url === "string" ? url : undefined,
      mimeType: typeof mimeType === "string" ? mimeType : undefined,
      label: typeof label === "string" ? label : undefined,
      previewUrl: typeof previewUrl === "string" ? previewUrl : undefined,
    });
  }
  return assets;
}

export function parseExports(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const { proposalMarkdown, emailDraftText, lastGeneratedAt, provider } = value as Record<string, unknown>;
  const parsedProvider = provider ? parseEnum(provider, conceptExportProviders) : undefined;
  const exports: Record<string, unknown> = {};
  if (typeof proposalMarkdown === "string") exports.proposalMarkdown = proposalMarkdown;
  if (typeof emailDraftText === "string") exports.emailDraftText = emailDraftText;
  if (typeof lastGeneratedAt === "string") exports.lastGeneratedAt = lastGeneratedAt;
  if (parsedProvider) exports.provider = parsedProvider;
  return Object.keys(exports).length ? exports : undefined;
}

export function parseStatus(value: unknown) {
  return parseEnum(value, conceptStatuses);
}

export function parseType(value: unknown) {
  return parseEnum(value, conceptTypes);
}

export function parseGranularity(value: unknown) {
  return parseEnum(value, conceptGranularities);
}

export function buildSnapshotPayload(concept: Pick<Concept, "brandKey" | "type" | "granularity"> & Partial<Concept>) {
  return {
    brandKey: concept.brandKey,
    type: concept.type,
    granularity: concept.granularity,
    sections: concept.sections || {},
    references: concept.references || {},
    assets: concept.assets || [],
    exports: concept.exports || {},
  };
}
