import { hash } from "bcryptjs";
import { networkRegistrationInputSchema } from "@artclub/models";
import { connectMongo } from "@/lib/server/mongodb";
import { apiError } from "@/lib/server/network-service";
import { CanonicalArtistModel, NetworkProfileModel, UserModel } from "@/lib/server/models";
import { duplicateKeyFields, duplicateRegistrationError, ensureNetworkRegistrationIndexes, uniqueProfileIdentity } from "@/lib/server/network-registration";
import { normalizeShopDomain } from "@/lib/server/shop-domain";

class RegisteredEmailError extends Error {}

function developmentLog(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") console.info(`[network-register] ${event}`, details);
}

function duplicateLog(error: any) {
  const fields = duplicateKeyFields(error);
  if (process.env.NODE_ENV !== "production") {
    console.warn("[network-register] duplicate_key", { code: error?.code, keyPattern: error?.keyPattern, keyValue: error?.keyValue });
  } else {
    console.warn("[network-register] duplicate_key", { code: error?.code, fields });
  }
}

export async function POST(req: Request) {
  const parsed = networkRegistrationInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_registration", 400, parsed.error.flatten());
  const email = parsed.data.email.trim().toLowerCase();
  const shopDomain = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN || "");
  if (!shopDomain) return apiError("network_registration_setup_required", 503);

  const mongo = await connectMongo();
  await ensureNetworkRegistrationIndexes(mongo.connection);
  developmentLog("email_lookup", { normalizedEmail: email, model: "User", collection: UserModel.collection.collectionName });
  const existing = await UserModel.findOne({ email }).select({ _id: 1, registrationAttemptId: 1 }).setOptions({ sanitizeFilter: true }).lean();
  developmentLog("email_lookup_result", { normalizedEmail: email, found: Boolean(existing) });
  if (existing) {
    if (parsed.data.registrationAttemptId && existing.registrationAttemptId === parsed.data.registrationAttemptId) {
      return Response.json({ ok: true, userId: existing._id.toString(), idempotent: true });
    }
    return apiError("email_already_registered", 409);
  }

  const recent = await UserModel.countDocuments({ accountSource: "self_registered", createdAt: { $gte: new Date(Date.now() - 60_000) } });
  if (recent > 30) return apiError("rate_limited", 429);
  const passwordHash = await hash(parsed.data.password, 12);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const session = await mongo.startSession();
    try {
      const result = await session.withTransaction(async () => {
        const concurrent = await UserModel.findOne({ email }).select({ _id: 1, registrationAttemptId: 1 }).session(session).lean();
        if (concurrent) {
          if (parsed.data.registrationAttemptId && concurrent.registrationAttemptId === parsed.data.registrationAttemptId) return { userId: concurrent._id.toString(), idempotent: true };
          throw new RegisteredEmailError();
        }

        const artistMatches = await CanonicalArtistModel.find({
          shopDomain,
          email,
          $or: [{ linkedUserId: { $exists: false } }, { linkedUserId: null }],
        }).limit(2).session(session);
        let artist = artistMatches.length === 1 ? artistMatches[0] : null;
        let reusableProfile = artist ? await NetworkProfileModel.findOne({ canonicalArtistId: artist._id }).session(session) : null;
        if (reusableProfile) {
          const profileOwnerExists = await UserModel.exists({ _id: reusableProfile.userId }).session(session);
          if (profileOwnerExists) { artist = null; reusableProfile = null; }
        }

        const user = new UserModel({
          email,
          name: parsed.data.name,
          passwordHash,
          role: artist ? "artist" : "customer",
          shopDomain,
          ...(artist ? { artistKey: artist.artistKey } : {}),
          accountSource: "self_registered",
          registrationAttemptId: parsed.data.registrationAttemptId,
          onboardingComplete: true,
          isActive: true,
        });
        await user.save({ session });

        if (reusableProfile && artist) {
          reusableProfile.userId = user._id;
          await reusableProfile.save({ session });
        } else {
          const identity = await uniqueProfileIdentity(artist?.displayName || parsed.data.name, session);
          await NetworkProfileModel.create([{
            userId: user._id,
            profileType: artist ? "artist" : "art_enthusiast",
            slug: identity,
            username: identity,
            displayName: artist?.displayName || parsed.data.name,
            bio: artist?.bio || "",
            city: artist?.locationCity || "",
            country: artist?.locationCountry || "",
            website: artist?.websiteUrl || "",
            instagram: artist?.instagram || "",
            profileImageUrl: artist?.profileImages?.avatarUrl || "",
            coverImageUrl: artist?.profileImages?.heroUrl || "",
            canonicalArtistId: artist?._id,
            isPublic: artist?.publicProfile?.isVisible !== false,
          }], { session });
        }

        if (artist) {
          artist.linkedUserId = user._id;
          artist.accountStatus = "linked";
          artist.linkStatus = "linked";
          await artist.save({ session });
        }
        return { userId: user._id.toString(), idempotent: false };
      });
      if (!result) throw new Error("registration_transaction_aborted");
      return Response.json({ ok: true, ...result }, { status: result.idempotent ? 200 : 201 });
    } catch (error: any) {
      if (error instanceof RegisteredEmailError) return apiError("email_already_registered", 409);
      if (error?.code !== 11000) {
        console.error("[network-register] failed", { name: error?.name || "Error", code: error?.code || null });
        return apiError("registration_failed", 500);
      }
      duplicateLog(error);
      const kind = duplicateRegistrationError(error);
      if (kind === "email" || kind === "attempt") {
        const winner = await UserModel.findOne({ email }).select({ _id: 1, registrationAttemptId: 1 }).lean();
        if (winner && parsed.data.registrationAttemptId && winner.registrationAttemptId === parsed.data.registrationAttemptId) {
          return Response.json({ ok: true, userId: winner._id.toString(), idempotent: true });
        }
        if (kind === "email") return apiError("email_already_registered", 409);
      }
      if (["slug", "username", "identity"].includes(kind) && attempt < 5) continue;
      console.error("[network-register] unique_conflict", { kind, fields: duplicateKeyFields(error) });
      return apiError(kind === "username" ? "username_conflict" : "registration_conflict", 409);
    } finally {
      await session.endSession();
    }
  }
  return apiError("registration_conflict", 409);
}
