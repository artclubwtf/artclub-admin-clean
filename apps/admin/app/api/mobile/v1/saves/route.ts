import { NextResponse } from "next/server";
import { Types, type PipelineStage } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { UserSavedModel } from "@/models/UserSaved";

type SavesCursor = {
  createdAt: number;
  id: string;
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
  signals: {
    savesCount: number;
    reactions: Record<string, number>;
    viewsCount: number;
  };
};

function encodeCursor(cursor: SavesCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeCursor(raw?: string | null): SavesCursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<SavesCursor>;
    if (typeof parsed.createdAt !== "number" || typeof parsed.id !== "string") return null;
    if (!Number.isFinite(parsed.createdAt)) return null;
    return { createdAt: Math.floor(parsed.createdAt), id: parsed.id };
  } catch {
    return null;
  }
}

function buildCursorMatch(cursor: SavesCursor, objectId: Types.ObjectId) {
  const cursorDate = new Date(cursor.createdAt);
  const safeDate = Number.isNaN(cursorDate.getTime()) ? new Date(0) : cursorDate;
  return {
    $or: [
      { createdAt: { $lt: safeDate } },
      { createdAt: safeDate, _id: { $lt: objectId } },
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
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 60) : 30;
    const cursor = decodeCursor(searchParams.get("cursor"));
    const cursorObjectId =
      cursor?.id && Types.ObjectId.isValid(cursor.id) ? new Types.ObjectId(cursor.id) : null;

    await connectMongo();

    const pipeline: PipelineStage[] = [
      { $match: { userId: user.id } },
    ];

    if (cursor && cursorObjectId) {
      pipeline.push({ $match: buildCursorMatch(cursor, cursorObjectId) });
    }

    pipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      { $limit: limit + 1 },
      {
        $lookup: {
          from: "shopify_artworks_cache",
          localField: "productGid",
          foreignField: "productGid",
          as: "cache",
        },
      },
      { $unwind: { path: "$cache", preserveNullAndEmptyArrays: true } },
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
        $project: {
          productGid: 1,
          createdAt: 1,
          cache: {
            productGid: "$cache.productGid",
            title: "$cache.title",
            handle: "$cache.handle",
            artistName: "$cache.artistName",
            tags: "$cache.tags",
            images: "$cache.images",
            widthCm: "$cache.widthCm",
            heightCm: "$cache.heightCm",
            priceEur: "$cache.priceEur",
            isOriginalTagged: "$cache.isOriginalTagged",
          },
          signals: {
            savesCount: { $ifNull: ["$signals.savesCount", 0] },
            reactions: { $ifNull: ["$signals.reactions", {}] },
            viewsCount: { $ifNull: ["$signals.viewsCount", 0] },
          },
        },
      },
    );

    const docs = (await UserSavedModel.aggregate(pipeline).exec()) as Array<{
      _id: Types.ObjectId;
      productGid: string;
      createdAt: Date;
      cache?: {
        productGid?: string;
        title?: string;
        handle?: string;
        artistName?: string;
        tags?: string[];
        images?: { thumbUrl?: string; mediumUrl?: string; originalUrl?: string };
        widthCm?: number;
        heightCm?: number;
        priceEur?: number | null;
        isOriginalTagged?: boolean;
      } | null;
      signals?: {
        savesCount?: number;
        reactions?: Record<string, number>;
        viewsCount?: number;
      };
    }>;

    const hasMore = docs.length > limit;
    const itemsSlice = hasMore ? docs.slice(0, limit) : docs;
    const nextCursorDoc = hasMore ? itemsSlice[itemsSlice.length - 1] : null;

    const items: FeedItem[] = itemsSlice
      .filter((doc) => doc.cache && doc.cache.productGid && doc.cache.title && doc.cache.handle)
      .map((doc) => ({
        id: doc.cache?.productGid ?? doc.productGid,
        title: doc.cache?.title ?? "",
        handle: doc.cache?.handle ?? "",
        artistName: doc.cache?.artistName || undefined,
        tags: Array.isArray(doc.cache?.tags) ? doc.cache?.tags ?? [] : [],
        images: resolveImageUrls(doc.cache?.images),
        widthCm: doc.cache?.widthCm,
        heightCm: doc.cache?.heightCm,
        priceEur: doc.cache?.priceEur ?? null,
        isOriginalTagged: doc.cache?.isOriginalTagged,
        signals: {
          savesCount: doc.signals?.savesCount ?? 0,
          reactions: doc.signals?.reactions ?? {},
          viewsCount: doc.signals?.viewsCount ?? 0,
        },
      }));

    const nextCursor =
      nextCursorDoc && nextCursorDoc.createdAt
        ? encodeCursor({
            createdAt: new Date(nextCursorDoc.createdAt).getTime(),
            id: nextCursorDoc._id.toString(),
          })
        : undefined;

    return NextResponse.json({ items, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("Failed to load saved artworks", err);
    const message = err instanceof Error ? err.message : "Failed to load saved";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
