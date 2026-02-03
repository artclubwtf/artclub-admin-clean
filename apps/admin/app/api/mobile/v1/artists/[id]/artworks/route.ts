import { NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

type FeedItem = {
  id: string;
  title: string;
  handle: string;
  artistName?: string;
  tags: string[];
  images: { thumbUrl?: string; mediumUrl?: string };
  widthCm?: number;
  heightCm?: number;
  priceEur?: number | null;
  isOriginalTagged?: boolean;
  signals: {
    savesCount: number;
    reactions: Record<string, number>;
    viewsCount: number;
  };
};

type ArtistCursor = {
  lastImportedAt: number;
  productGid: string;
};

function encodeCursor(cursor: ArtistCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeCursor(raw?: string | null): ArtistCursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<ArtistCursor>;
    if (typeof parsed.lastImportedAt !== "number" || typeof parsed.productGid !== "string") return null;
    if (!Number.isFinite(parsed.lastImportedAt)) return null;
    return {
      lastImportedAt: Math.floor(parsed.lastImportedAt),
      productGid: parsed.productGid,
    };
  } catch {
    return null;
  }
}

function isMetaobjectId(id: string) {
  return id.startsWith("gid://");
}

function buildArtistNameRegex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const pattern = `^\\s*${parts.join("\\s+")}\\s*$`;
  return new RegExp(pattern, "i");
}

function buildCursorMatch(cursor: ArtistCursor) {
  const cursorDate = new Date(cursor.lastImportedAt);
  const safeDate = Number.isNaN(cursorDate.getTime()) ? new Date(0) : cursorDate;
  return {
    $or: [
      { lastImportedAtSort: { $lt: safeDate } },
      { lastImportedAtSort: safeDate, productGid: { $gt: cursor.productGid } },
    ],
  };
}

function resolveImageUrls(images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string }) {
  const thumbUrl = images?.thumbUrl || images?.mediumUrl || images?.originalUrl;
  const mediumUrl = images?.mediumUrl || images?.originalUrl || images?.thumbUrl;
  return { thumbUrl, mediumUrl };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rawId = decodeURIComponent(id || "").trim();
    if (!rawId) {
      return NextResponse.json({ error: "artist id is required" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 60) : 30;
    const cursor = decodeCursor(searchParams.get("cursor"));

    await connectMongo();

    const metaobject = isMetaobjectId(rawId);
    const artistRegex = metaobject ? null : buildArtistNameRegex(rawId);

    const pipeline: PipelineStage[] = [
      {
        $lookup: {
          from: "artwork_signals",
          localField: "productGid",
          foreignField: "productGid",
          as: "signals",
        },
      },
      { $unwind: { path: "$signals", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          lastImportedAtSort: { $ifNull: ["$lastImportedAt", new Date(0)] },
        },
      },
    ];

    if (metaobject) {
      pipeline.push({ $match: { artistMetaobjectGid: rawId } });
    } else if (artistRegex) {
      pipeline.push({ $match: { artistName: { $regex: artistRegex } } });
    }

    if (cursor) {
      pipeline.push({ $match: buildCursorMatch(cursor) });
    }

    pipeline.push(
      {
        $sort: {
          lastImportedAtSort: -1,
          productGid: 1,
        },
      },
      { $limit: limit + 1 },
      {
        $project: {
          productGid: 1,
          title: 1,
          handle: 1,
          artistName: 1,
          tags: 1,
          images: 1,
          widthCm: 1,
          heightCm: 1,
          priceEur: 1,
          isOriginalTagged: 1,
          lastImportedAtSort: 1,
          signals: {
            savesCount: { $ifNull: ["$signals.savesCount", 0] },
            reactions: { $ifNull: ["$signals.reactions", {}] },
            viewsCount: { $ifNull: ["$signals.viewsCount", 0] },
          },
        },
      },
    );

    const docs = (await ShopifyArtworkCacheModel.aggregate(pipeline).exec()) as Array<{
      productGid: string;
      title: string;
      handle: string;
      artistName?: string;
      tags?: string[];
      images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
      widthCm?: number;
      heightCm?: number;
      priceEur?: number | null;
      isOriginalTagged?: boolean;
      lastImportedAtSort?: Date;
      signals?: { savesCount?: number; reactions?: Record<string, number>; viewsCount?: number };
    }>;

    const hasMore = docs.length > limit;
    const itemsSlice = hasMore ? docs.slice(0, limit) : docs;
    const nextCursorDoc = hasMore ? itemsSlice[itemsSlice.length - 1] : null;

    const items: FeedItem[] = itemsSlice.map((doc) => ({
      id: doc.productGid,
      title: doc.title,
      handle: doc.handle,
      artistName: doc.artistName || undefined,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      images: resolveImageUrls(doc.images),
      widthCm: doc.widthCm,
      heightCm: doc.heightCm,
      priceEur: doc.priceEur ?? null,
      isOriginalTagged: doc.isOriginalTagged,
      signals: {
        savesCount: doc.signals?.savesCount ?? 0,
        reactions: doc.signals?.reactions ?? {},
        viewsCount: doc.signals?.viewsCount ?? 0,
      },
    }));

    const nextCursor =
      nextCursorDoc && nextCursorDoc.lastImportedAtSort
        ? encodeCursor({
            lastImportedAt: new Date(nextCursorDoc.lastImportedAtSort).getTime(),
            productGid: nextCursorDoc.productGid,
          })
        : undefined;

    return NextResponse.json({ ok: true, items, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("Failed to load artist artworks", err);
    const message = err instanceof Error ? err.message : "Failed to load artist artworks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
