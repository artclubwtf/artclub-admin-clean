import { hash } from "bcryptjs";
import { duplicateKeyFields, duplicateRegistrationError, networkRegistrationInputSchema } from "@artclub/models";
import { connectMongo } from "@/lib/server/mongodb";
import { apiError } from "@/lib/server/network-service";
import { UserModel } from "@/lib/server/models";
import { ensureNetworkRegistrationIndexes } from "@/lib/server/network-registration";
import { normalizeShopDomain } from "@/lib/server/shop-domain";

function developmentLog(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") console.info(`[network-register] ${event}`, details);
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
  const existing = await UserModel.findOne({ email }).select({ _id: 1, registrationAttemptId: 1 }).lean();
  developmentLog("email_lookup_result", { normalizedEmail: email, found: Boolean(existing) });
  if (existing) {
    if (parsed.data.registrationAttemptId && existing.registrationAttemptId === parsed.data.registrationAttemptId) return Response.json({ ok: true, userId: existing._id.toString(), idempotent: true });
    return apiError("email_already_registered", 409);
  }

  const recent = await UserModel.countDocuments({ accountSource: "self_registered", createdAt: { $gte: new Date(Date.now() - 60_000) } });
  if (recent > 30) return apiError("rate_limited", 429);
  try {
    const user = await UserModel.create({
      email,
      name: parsed.data.name,
      passwordHash: await hash(parsed.data.password, 12),
      role: "customer",
      shopDomain,
      accountSource: "self_registered",
      registrationAttemptId: parsed.data.registrationAttemptId,
      onboardingComplete: true,
      networkRoleSelectionCompleted: false,
      networkOnboardingCompleted: false,
      isActive: true,
    });
    return Response.json({ ok: true, userId: user._id.toString() }, { status: 201 });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const fields = duplicateKeyFields(error);
    if (process.env.NODE_ENV !== "production") console.warn("[network-register] duplicate_key", { code: error.code, keyPattern: error.keyPattern, keyValue: error.keyValue });
    else console.warn("[network-register] duplicate_key", { code: error.code, fields });
    const kind = duplicateRegistrationError(error);
    if (kind === "email" || kind === "attempt") {
      const winner = await UserModel.findOne({ email }).select({ _id: 1, registrationAttemptId: 1 }).lean();
      if (winner && parsed.data.registrationAttemptId && winner.registrationAttemptId === parsed.data.registrationAttemptId) return Response.json({ ok: true, userId: winner._id.toString(), idempotent: true });
      if (kind === "email") return apiError("email_already_registered", 409);
    }
    console.error("[network-register] unique_conflict", { kind, fields });
    return apiError("registration_conflict", 409);
  }
}
