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

const payloadSchema = z
  .object({
    count: z.number().int().min(1).max(200).default(1),
    expiresInDays: z.number().int().min(1).max(365).default(ARTIST_KEY_DEFAULT_EXPIRY_DAYS),
  })
  .strict();

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
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
