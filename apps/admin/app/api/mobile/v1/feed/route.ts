import { NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

type FeedCursor = {
  savesCount: number;
  lastImportedAt: number;
  productGid: string;
};

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
};

function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeCursor(raw?: string | null): FeedCursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<FeedCursor>;
    if (
      typeof parsed.savesCount !== "number" ||
      typeof parsed.lastImportedAt !== "number" ||
      typeof parsed.productGid !== "string"
    ) {
      return null;
    }
    if (!Number.isFinite(parsed.savesCount) || !Number.isFinite(parsed.lastImportedAt)) {
      return null;
    }
    return {
      savesCount: Math.floor(parsed.savesCount),
      lastImportedAt: Math.floor(parsed.lastImportedAt),
      productGid: parsed.productGid,
    };
  } catch {
    return null;
  }
}

function buildCursorMatch(cursor: FeedCursor) {
  const cursorDate = new Date(cursor.lastImportedAt);
  const safeDate = Number.isNaN(cursorDate.getTime()) ? new Date(0) : cursorDate;
  return {
    $or: [
      { savesCountSort: { $lt: cursor.savesCount } },
      { savesCountSort: cursor.savesCount, lastImportedAtSort: { $lt: safeDate } },
      { savesCountSort: cursor.savesCount, lastImportedAtSort: safeDate, productGid: { $gt: cursor.productGid } },
    ],
  };
}

function resolveImageUrls(images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string }) {
  const thumbUrl = images?.thumbUrl || images?.mediumUrl || images?.originalUrl;
  const mediumUrl = images?.mediumUrl || images?.originalUrl || images?.thumbUrl;
  return { thumbUrl, mediumUrl };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 50) : 10;
    const cursor = decodeCursor(searchParams.get("cursor"));

    await connectMongo();

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
          savesCountSort: { $ifNull: ["$signals.savesCount", 0] },
          lastImportedAtSort: { $ifNull: ["$lastImportedAt", new Date(0)] },
        },
      },
    ];

    if (cursor) {
      pipeline.push({ $match: buildCursorMatch(cursor) });
    }

    pipeline.push(
      {
        $sort: {
          savesCountSort: -1,
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
          savesCountSort: 1,
          lastImportedAtSort: 1,
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
      savesCountSort?: number;
      lastImportedAtSort?: Date;
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
    }));

    const nextCursor =
      nextCursorDoc && typeof nextCursorDoc.savesCountSort === "number"
        ? encodeCursor({
            savesCount: nextCursorDoc.savesCountSort || 0,
            lastImportedAt: nextCursorDoc.lastImportedAtSort
              ? new Date(nextCursorDoc.lastImportedAtSort).getTime()
              : 0,
            productGid: nextCursorDoc.productGid,
          })
        : undefined;

    return NextResponse.json({ items, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("Failed to load mobile feed", err);
    const message = err instanceof Error ? err.message : "Failed to load feed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
