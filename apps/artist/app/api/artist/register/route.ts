import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/server/mongodb";
import { ensureCanonicalArtistIndexes } from "@/lib/server/canonical-artist-indexes";
import { resolveShopDomain } from "@/lib/server/shop-domain";
import { ArtistRegistrationKeyModel, CanonicalArtistModel, UserModel } from "@/lib/server/models";

const PASSWORD_HASH_ROUNDS = 12;

const payloadSchema = z
  .object({
    key: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: z.string().min(8),
  })
  .strict();

function normalizeArtistRegistrationCode(value: string) {
  return value.trim().toUpperCase();
}

function toDisplayNameFromEmail(email: string) {
  const base = email.split("@")[0]?.trim();
  return base && base.length > 0 ? base : "Artist";
}

function isDuplicateKeyError(err: unknown) {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}

function getDuplicateKeyFields(err: unknown) {
  if (!err || typeof err !== "object") return [];
  const keyPattern =
    "keyPattern" in err && err.keyPattern && typeof err.keyPattern === "object"
      ? Object.keys(err.keyPattern as Record<string, unknown>)
      : [];
  const keyValue =
    "keyValue" in err && err.keyValue && typeof err.keyValue === "object"
      ? Object.keys(err.keyValue as Record<string, unknown>)
      : [];
  return Array.from(new Set([...keyPattern, ...keyValue]));
}

async function resolveExistingArtistAccount(params: {
  existing: {
    _id: Types.ObjectId;
    role?: string;
    shopDomain?: string;
    artistKey?: string | null;
    artistId?: Types.ObjectId | null;
    pendingRegistrationId?: Types.ObjectId | null;
    onboardingComplete?: boolean;
    isActive?: boolean;
    passwordHash?: string;
  } | null;
  password: string;
  shopDomain: string;
}) {
  const { existing, password, shopDomain } = params;
  if (!existing || existing.role !== "artist" || existing.isActive !== true || existing.shopDomain !== shopDomain) {
    return null;
  }
  if (!existing.passwordHash) {
    return null;
  }

  const passwordMatches = await compare(password, existing.passwordHash).catch(() => false);
  if (!passwordMatches) {
    return null;
  }

  return {
    ok: true as const,
    artistKey: existing.artistKey || null,
    onboardingComplete: existing.onboardingComplete === true,
    existingAccount: true,
    userId: existing._id.toString(),
  };
}

function canInitializeExistingArtistUser(params: {
  existing: {
    role?: string;
    shopDomain?: string;
    artistKey?: string | null;
    artistId?: Types.ObjectId | null;
    pendingRegistrationId?: Types.ObjectId | null;
    isActive?: boolean;
  } | null;
  shopDomain: string;
}) {
  const { existing, shopDomain } = params;
  if (!existing || existing.role !== "artist" || existing.isActive !== true) {
    return false;
  }
  if (existing.artistKey || existing.artistId) {
    return false;
  }
  if (existing.shopDomain && existing.shopDomain !== shopDomain) {
    return false;
  }
  return Boolean(existing.pendingRegistrationId) || !existing.shopDomain;
}

export async function POST(req: Request) {
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
    await ensureCanonicalArtistIndexes();

    const existing = await UserModel.findOne({ email })
      .select({
        _id: 1,
        role: 1,
        shopDomain: 1,
        artistKey: 1,
        artistId: 1,
        pendingRegistrationId: 1,
        onboardingComplete: 1,
        isActive: 1,
        passwordHash: 1,
      })
      .lean();

    const keyDoc = await ArtistRegistrationKeyModel.findOne({ code })
      .select({ _id: 1, expiresAt: 1, usedAt: 1, usedByUserId: 1 })
      .lean();
    if (!keyDoc) {
      return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 404 });
    }
    if (keyDoc.usedAt) {
      const existingAccount = await resolveExistingArtistAccount({ existing, password, shopDomain });
      if (existingAccount && keyDoc.usedByUserId?.toString() === existingAccount.userId) {
        return NextResponse.json(existingAccount, { status: 200 });
      }
      return NextResponse.json({ ok: false, error: "key_already_used" }, { status: 409 });
    }
    if (keyDoc.expiresAt.getTime() <= now.getTime()) {
      return NextResponse.json({ ok: false, error: "key_expired" }, { status: 410 });
    }

    const canInitializeExisting = canInitializeExistingArtistUser({ existing, shopDomain });

    if (existing && !canInitializeExisting) {
      const existingAccount = await resolveExistingArtistAccount({ existing, password, shopDomain });
      if (existingAccount) {
        console.info("[artist-register] existing_artist_account_reused");
        return NextResponse.json(existingAccount, { status: 200 });
      }
      console.warn("[artist-register] blocked_existing_account", {
        role: existing.role || null,
        hasArtistKey: Boolean(existing.artistKey),
        hasArtistId: Boolean(existing.artistId),
        hasPendingRegistrationId: Boolean(existing.pendingRegistrationId),
        hasShopDomain: Boolean(existing.shopDomain),
        matchesShopDomain: existing.shopDomain === shopDomain,
        isActive: existing.isActive === true,
      });
      return NextResponse.json(
        {
          ok: false,
          error: existing.role === "artist" ? "email_exists" : "email_in_use_other_account",
        },
        { status: 409 },
      );
    }

    const userId = existing?._id || new Types.ObjectId();
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
      if (!latest) return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 404 });
      if (latest.expiresAt.getTime() <= Date.now()) {
        return NextResponse.json({ ok: false, error: "key_expired" }, { status: 410 });
      }
      return NextResponse.json({ ok: false, error: "key_already_used" }, { status: 409 });
    }

    const artistKey = `artist_${userId.toString()}`;
    const displayName = toDisplayNameFromEmail(email);
    const passwordHash = await hash(password, PASSWORD_HASH_ROUNDS);

    try {
      if (canInitializeExisting) {
        await UserModel.updateOne(
          { _id: userId },
          {
            $set: {
              email,
              role: "artist",
              shopDomain,
              passwordHash,
              artistKey,
              accountSource: "app_native",
              onboardingComplete: false,
              isActive: true,
              mustChangePassword: false,
            },
            $unset: {
              pendingRegistrationId: 1,
              onboardingStatus: 1,
              artistId: 1,
            },
          },
        );
      } else {
        await UserModel.create({
          _id: userId,
          email,
          role: "artist",
          shopDomain,
          passwordHash,
          artistKey,
          accountSource: "app_native",
          onboardingComplete: false,
          isActive: true,
          mustChangePassword: false,
        });
      }

      const linkedArtist = await CanonicalArtistModel.findOneAndUpdate(
        {
          shopDomain,
          artistKey,
          $or: [{ linkedUserId: { $exists: false } }, { linkedUserId: null }, { linkedUserId: userId }],
        },
        {
          $set: {
            linkedUserId: userId,
            accountStatus: "onboarding_pending",
            linkStatus: "linked",
            email,
          },
          $setOnInsert: {
            shopDomain,
            artistKey,
            handle: artistKey,
            displayName,
          },
        },
        { upsert: true, new: true },
      );
      if (!linkedArtist || linkedArtist.linkedUserId?.toString() !== userId.toString()) {
        throw new Error("artist_link_failed");
      }
    } catch (err) {
      if (!canInitializeExisting) {
        await CanonicalArtistModel.deleteOne({ shopDomain, artistKey }).catch(() => null);
        await UserModel.deleteOne({ _id: userId }).catch(() => null);
      }
      await ArtistRegistrationKeyModel.updateOne(
        { _id: claim._id, usedByUserId: userId },
        { $unset: { usedAt: 1, usedByUserId: 1 } },
      ).catch(() => null);

      if (isDuplicateKeyError(err)) {
        const duplicateFields = getDuplicateKeyFields(err);
        const isEmailConflict = duplicateFields.includes("email");
        const isArtistKeyConflict = duplicateFields.includes("artistKey");
        const isCanonicalArtistConflict = duplicateFields.includes("shopDomain") && duplicateFields.includes("artistKey");
        console.warn("[artist-register] duplicate_key", {
          duplicateFields,
          isEmailConflict,
          isArtistKeyConflict,
          isCanonicalArtistConflict,
        });
        const latestUser = await UserModel.findOne({ email })
          .select({ _id: 1, role: 1, artistKey: 1, artistId: 1, pendingRegistrationId: 1, shopDomain: 1, isActive: 1, passwordHash: 1, onboardingComplete: 1 })
          .lean()
          .catch(() => null);
        const existingAccount = await resolveExistingArtistAccount({ existing: latestUser, password, shopDomain });
        if (existingAccount) {
          return NextResponse.json(existingAccount, { status: 200 });
        }
        if (!isEmailConflict && (isArtistKeyConflict || isCanonicalArtistConflict)) {
          return NextResponse.json({ ok: false, error: "register_conflict" }, { status: 409 });
        }
        return NextResponse.json(
          {
            ok: false,
            error: latestUser ? (latestUser.role === "artist" ? "email_exists" : "email_in_use_other_account") : "register_conflict",
          },
          { status: 409 },
        );
      }

      console.error("Artist register failed", err);
      return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        artistKey,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Artist register request failed", err);
    return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
  }
}
