import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { ArtworkSignalsModel } from "@/models/ArtworkSignals";
import { UserSavedModel } from "@/models/UserSaved";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

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

type UserSavedDoc = {
  _id: Types.ObjectId;
  productGid?: string;
  createdAt?: Date;
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

function resolveImageUrls(images?: {
  thumbUrl?: string | null;
  mediumUrl?: string | null;
  originalUrl?: string | null;
}) {
  const thumbUrl = images?.thumbUrl || images?.mediumUrl || images?.originalUrl;
  const mediumUrl = images?.mediumUrl || images?.originalUrl || images?.thumbUrl;
  return { thumbUrl, mediumUrl };
}

function normalizeProductGid(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function extractProductNumericId(gid: string) {
  const match = /Product\/(\d+)/.exec(gid);
  return match ? match[1] : null;
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

    const userObjectId = Types.ObjectId.isValid(user.id) ? new Types.ObjectId(user.id) : null;
    const userIdValues = userObjectId ? [userObjectId, user.id] : [user.id];
    if (userObjectId) {
      await UserSavedModel.collection.updateMany(
        { userId: user.id },
        { $set: { userId: userObjectId } },
      );
    }

    const query: Record<string, unknown> = { userId: { $in: userIdValues } };
    if (cursor && cursorObjectId) {
      Object.assign(query, buildCursorMatch(cursor, cursorObjectId));
    }

    const docs = (await UserSavedModel.collection
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray()) as UserSavedDoc[];

    const hasMore = docs.length > limit;
    const itemsSlice = hasMore ? docs.slice(0, limit) : docs;
    const nextCursorDoc = hasMore ? itemsSlice[itemsSlice.length - 1] : null;

    const normalizedIds = itemsSlice
      .map((doc) => normalizeProductGid(doc.productGid || ""))
      .filter(Boolean);
    const idVariants = Array.from(
      new Set([
        ...normalizedIds,
        ...normalizedIds.map((id) => (id.endsWith("/") ? id : `${id}/`)),
      ]),
    );

    const cacheDocs = await ShopifyArtworkCacheModel.find({
      $or: [
        { productGid: { $in: idVariants } },
        { productNumericId: { $in: normalizedIds.map(extractProductNumericId).filter(Boolean) } },
      ],
    }).lean();
    const signalsDocs = await ArtworkSignalsModel.find({ productGid: { $in: idVariants } }).lean();
    const cacheById = new Map<string, (typeof cacheDocs)[number]>();
    cacheDocs.forEach((doc) => {
      if (doc.productGid) {
        cacheById.set(normalizeProductGid(doc.productGid), doc);
      }
      if (doc.productNumericId) {
        cacheById.set(doc.productNumericId, doc);
      }
    });
    const signalsById = new Map(signalsDocs.map((doc) => [normalizeProductGid(doc.productGid), doc]));

    const items: FeedItem[] = itemsSlice
      .map((doc) => {
        const gid = normalizeProductGid(doc.productGid || "");
        const numericId = extractProductNumericId(gid);
        const cache = cacheById.get(gid) || (numericId ? cacheById.get(numericId) : undefined);
        if (!cache || !cache.productGid || !cache.title || !cache.handle) return null;
        const signals = signalsById.get(gid);
        return {
          id: cache.productGid,
          title: cache.title,
          handle: cache.handle,
          artistName: cache.artistName || undefined,
          tags: Array.isArray(cache.tags) ? cache.tags : [],
          images: resolveImageUrls(cache.images),
          widthCm: cache.widthCm,
          heightCm: cache.heightCm,
          priceEur: cache.priceEur ?? null,
          isOriginalTagged: cache.isOriginalTagged,
          signals: {
            savesCount: signals?.savesCount ?? 0,
            reactions: signals?.reactions ?? {},
            viewsCount: signals?.viewsCount ?? 0,
          },
        };
      })
      .filter(Boolean) as FeedItem[];

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
