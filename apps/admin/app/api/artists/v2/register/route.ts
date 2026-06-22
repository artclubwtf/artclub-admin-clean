import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { normalizeArtistRegistrationCode } from "@/lib/artistRegistrationKeys";
import { sendEmail } from "@/lib/email";
import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { ArtistRegistrationKeyModel } from "@/models/ArtistRegistrationKey";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

const PASSWORD_HASH_ROUNDS = 12;

const payloadSchema = z
  .object({
    key: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: z.string().min(8),
  })
  .strict();

function toDisplayNameFromEmail(email: string): string {
  const base = email.split("@")[0]?.trim();
  return base && base.length > 0 ? base : "Artist";
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}

export async function POST(req: Request) {
  if (process.env.ENABLE_LEGACY_ARTIST_V2_REGISTER !== "true") {
    return NextResponse.json(
      {
        ok: false,
        error: "legacy_artist_v2_register_disabled",
        message: "Use apps/artist registration or Admin Artists V2 provisioning.",
      },
      { status: 410 },
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = payloadSchema.safeParse(body || {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const code = normalizeArtistRegistrationCode(parsed.data.key);
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;
    const now = new Date();
    const shopDomain = resolveShopDomain();
    if (!shopDomain) {
      return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
    }

    await connectMongo();

    const keyDoc = await ArtistRegistrationKeyModel.findOne({ code }).select({ _id: 1, expiresAt: 1, usedAt: 1 }).lean();
    if (!keyDoc) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 404 });
    }
    if (keyDoc.usedAt) {
      return NextResponse.json({ ok: false, error: "key_already_used" }, { status: 409 });
    }
    if (keyDoc.expiresAt.getTime() <= now.getTime()) {
      return NextResponse.json({ ok: false, error: "key_expired" }, { status: 410 });
    }

    const existing = await UserModel.findOne({ email }).select({ _id: 1 }).lean();
    if (existing) {
      return NextResponse.json({ ok: false, error: "email_exists" }, { status: 409 });
    }

    const userId = new Types.ObjectId();
    const usedAt = new Date();
    const claim = await ArtistRegistrationKeyModel.findOneAndUpdate(
      {
        _id: keyDoc._id,
        usedAt: null,
        expiresAt: { $gt: usedAt },
      },
      {
        $set: {
          usedAt,
          usedByUserId: userId,
        },
      },
      { new: true },
    ).lean();

    if (!claim) {
      const latest = await ArtistRegistrationKeyModel.findOne({ code }).select({ _id: 1, expiresAt: 1, usedAt: 1 }).lean();
      if (!latest) {
        return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 404 });
      }
      if (latest.expiresAt.getTime() <= Date.now()) {
        return NextResponse.json({ ok: false, error: "key_expired" }, { status: 410 });
      }
      return NextResponse.json({ ok: false, error: "key_already_used" }, { status: 409 });
    }

    const artistKey = `artist_${userId.toString()}`;
    const displayName = toDisplayNameFromEmail(email);
    const passwordHash = await hash(password, PASSWORD_HASH_ROUNDS);

    try {
      await UserModel.create({
        _id: userId,
        email,
        role: "artist",
        shopDomain,
        passwordHash,
        artistKey,
        onboardingComplete: false,
        isActive: true,
        mustChangePassword: false,
      });

      await CanonicalArtistModel.create({
        shopDomain,
        artistKey,
        handle: artistKey,
        displayName,
        email,
      });

      await sendEmail({
        to: email,
        subject: "Welcome to Artclub",
        text: "Welcome! Your artist account is ready. Continue onboarding at /artists/onboarding.",
        html: "<p>Welcome! Your artist account is ready.</p><p>Continue onboarding at <strong>/artists/onboarding</strong>.</p>",
      }).catch(() => null);
    } catch (err) {
      await CanonicalArtistModel.deleteOne({ shopDomain, artistKey }).catch(() => null);
      await UserModel.deleteOne({ _id: userId }).catch(() => null);
      await ArtistRegistrationKeyModel.updateOne(
        { _id: claim._id, usedByUserId: userId },
        { $unset: { usedAt: 1, usedByUserId: 1 } },
      ).catch(() => null);

      if (isDuplicateKeyError(err)) {
        return NextResponse.json({ ok: false, error: "email_exists" }, { status: 409 });
      }

      console.error("Artist v2 register failed", err);
      return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        artistKey,
        session: {
          user: {
            id: userId.toString(),
            email,
            role: "artist",
            artistKey,
            onboardingComplete: false,
          },
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Artist v2 register request failed", err);
    return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
  }
}
