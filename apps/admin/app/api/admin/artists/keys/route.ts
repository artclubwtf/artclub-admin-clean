import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  ARTIST_KEY_DEFAULT_EXPIRY_DAYS,
  generateArtistRegistrationCode,
  getExpiryDateFromDays,
} from "@/lib/artistRegistrationKeys";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { ArtistRegistrationKeyModel } from "@/models/ArtistRegistrationKey";
import { UserModel } from "@/models/User";

const payloadSchema = z
  .object({
    count: z.number().int().min(1).max(200).default(1),
    expiresInDays: z.number().int().min(1).max(365).default(ARTIST_KEY_DEFAULT_EXPIRY_DAYS),
  })
  .strict();

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get("limit") ?? "50",
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_query" }, { status: 400 });
    }

    await connectMongo();

    const keys = await ArtistRegistrationKeyModel.find({})
      .sort({ createdAt: -1 })
      .limit(parsed.data.limit)
      .lean();

    const usedByIds = Array.from(
      new Set(keys.map((item) => item.usedByUserId?.toString()).filter((value): value is string => Boolean(value))),
    ).map((value) => new Types.ObjectId(value));

    const users = usedByIds.length
      ? await UserModel.find({ _id: { $in: usedByIds } }).select({ _id: 1, email: 1, artistKey: 1 }).lean()
      : [];
    const userById = new Map(users.map((user) => [user._id.toString(), user]));

    return NextResponse.json(
      {
        ok: true,
        keys: keys.map((item) => {
          const usedById = item.usedByUserId?.toString() || null;
          const usedByUser = usedById ? userById.get(usedById) : null;
          return {
            id: item._id.toString(),
            code: item.code,
            expiresAt: item.expiresAt,
            usedAt: item.usedAt || null,
            createdAt: item.createdAt,
            createdByAdminId: item.createdByAdminId?.toString() || null,
            usedBy: usedByUser
              ? {
                  id: usedByUser._id.toString(),
                  email: usedByUser.email,
                  artistKey: usedByUser.artistKey || null,
                }
              : null,
          };
        }),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to load artist registration keys", err);
    return NextResponse.json({ ok: false, error: "keys_list_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body || {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !Types.ObjectId.isValid(session.user.id)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await connectMongo();

    const { count, expiresInDays } = parsed.data;
    const expiresAt = getExpiryDateFromDays(expiresInDays);
    const createdByAdminId = new Types.ObjectId(session.user.id);
    const codes: string[] = [];

    for (let i = 0; i < count; i += 1) {
      let created = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = generateArtistRegistrationCode();
        try {
          await ArtistRegistrationKeyModel.create({
            code,
            expiresAt,
            createdByAdminId,
          });
          codes.push(code);
          created = true;
          break;
        } catch (err) {
          if (isDuplicateKeyError(err)) continue;
          throw err;
        }
      }

      if (!created) {
        return NextResponse.json({ ok: false, error: "key_generation_failed" }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        count: codes.length,
        expiresAt,
        codes,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to create artist registration keys", err);
    return NextResponse.json({ ok: false, error: "key_create_failed" }, { status: 500 });
  }
}
