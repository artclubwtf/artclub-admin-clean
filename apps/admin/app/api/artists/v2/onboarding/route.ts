import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getArtistShopifySyncMode } from "@/lib/artistShopifySyncMode";
import { sendEmail } from "@/lib/email";
import { ensureTermsDocument, loadActiveTermsModules } from "@/lib/terms";
import { connectMongo } from "@/lib/mongodb";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { TermsAcceptanceModel } from "@/models/TermsAcceptance";
import { UserModel } from "@/models/User";

const onboardingSubmitSchema = z
  .object({
    personal: z
      .object({
        fullName: z.string().trim().min(2),
        city: z.string().trim().max(120).optional().default(""),
        country: z.string().trim().max(120).optional().default(""),
        bio: z.string().trim().max(4000).optional().default(""),
      })
      .strict(),
    shopify: z
      .object({
        handle: z.string().trim().min(2),
        displayName: z.string().trim().min(2),
        instagram: z.string().trim().optional().default(""),
      })
      .strict(),
    profileImages: z
      .object({
        avatarUrl: z.string().trim().optional().default(""),
        heroUrl: z.string().trim().optional().default(""),
        galleryUrls: z.array(z.string().trim()).optional().default([]),
      })
      .strict(),
    consents: z
      .object({
        sellOriginals: z.boolean(),
        sellPrints: z.boolean(),
        rental: z.boolean(),
        exhibitions: z.boolean(),
        presentationOnly: z.boolean(),
      })
      .strict(),
    terms: z
      .object({
        acceptedDocumentSlugs: z.array(z.string().trim().min(1)),
        acceptedName: z.string().trim().min(2),
        accepted: z.boolean(),
      })
      .strict(),
  })
  .strict();

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",").map((part) => part.trim());
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || undefined;
}

function normalizeGalleryUrls(input: string[]) {
  return Array.from(new Set(input.map((value) => value.trim()).filter(Boolean))).slice(0, 10);
}

async function getCurrentArtistContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist" || !session.user.id || !Types.ObjectId.isValid(session.user.id)) {
    return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) } as const;
  }

  const user = await UserModel.findById(session.user.id).lean();
  if (!user || user.role !== "artist" || !user.isActive) {
    return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) } as const;
  }
  if (!user.artistKey || !user.shopDomain) {
    return { error: NextResponse.json({ ok: false, error: "artist_not_initialized" }, { status: 400 }) } as const;
  }

  let canonicalArtist = await CanonicalArtistModel.findOne({ shopDomain: user.shopDomain, artistKey: user.artistKey }).lean();
  if (!canonicalArtist) {
    const fallbackDisplayName = user.name?.trim() || user.email.split("@")[0] || "Artist";
    const created = await CanonicalArtistModel.create({
      shopDomain: user.shopDomain,
      artistKey: user.artistKey,
      handle: user.artistKey,
      displayName: fallbackDisplayName,
      email: user.email,
    });
    canonicalArtist = created.toObject();
  }

  return { session, user, canonicalArtist } as const;
}

export async function GET() {
  await connectMongo();
  await ensureTermsDocument("artist_registration_terms");

  const context = await getCurrentArtistContext();
  if ("error" in context) return context.error;

  const { user, canonicalArtist } = context;
  const activeTermsModules = await loadActiveTermsModules();
  const accepted = await TermsAcceptanceModel.find({ userId: user._id })
    .sort({ acceptedAt: -1 })
    .lean();

  return NextResponse.json(
    {
      ok: true,
      onboardingComplete: user.onboardingComplete === true,
      artistKey: user.artistKey,
      personal: {
        fullName: user.name || canonicalArtist.displayName || "",
        email: user.email,
        city: canonicalArtist.locationCity || "",
        country: canonicalArtist.locationCountry || "",
        bio: canonicalArtist.bio || "",
      },
      shopify: {
        handle: canonicalArtist.handle || "",
        displayName: canonicalArtist.displayName || "",
        instagram: canonicalArtist.instagram || "",
      },
      profileImages: {
        avatarUrl: canonicalArtist.profileImages?.avatarUrl || "",
        heroUrl: canonicalArtist.profileImages?.heroUrl || "",
        galleryUrls: Array.isArray(canonicalArtist.profileImages?.galleryUrls) ? canonicalArtist.profileImages.galleryUrls : [],
      },
      consents: {
        sellOriginals: canonicalArtist.consents?.allowOriginalSales === true,
        sellPrints: canonicalArtist.consents?.allowPrintSales === true,
        rental: canonicalArtist.consents?.allowRental === true,
        exhibitions: canonicalArtist.consents?.allowExhibitions === true,
        presentationOnly: canonicalArtist.consents?.presentationOnly === true,
      },
      terms: {
        activeModules: activeTermsModules.map((item) => ({
          documentSlug: item.document.slug,
          title: item.document.title,
          versionId: item.version.id,
          version: item.version.version,
          bodyMarkdown: item.version.bodyMarkdown,
          effectiveAt: item.version.effectiveAt,
        })),
        accepted: accepted.map((entry) => ({
          id: entry._id.toString(),
          documentSlug: entry.documentSlug,
          version: entry.version,
          versionId: entry.versionId?.toString() || null,
          acceptedAt: entry.acceptedAt,
          acceptedName: entry.acceptedName || "",
          snapshotHash: entry.snapshotHash,
        })),
      },
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  await connectMongo();
  await ensureTermsDocument("artist_registration_terms");

  const context = await getCurrentArtistContext();
  if ("error" in context) return context.error;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = onboardingSubmitSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const activeTermsModules = await loadActiveTermsModules();
  if (!activeTermsModules.length) {
    return NextResponse.json({ ok: false, error: "no_active_terms" }, { status: 500 });
  }

  if (!parsed.data.terms.accepted) {
    return NextResponse.json({ ok: false, error: "terms_not_accepted" }, { status: 400 });
  }

  const acceptedSlugs = new Set(parsed.data.terms.acceptedDocumentSlugs.map((slug) => slug.trim().toLowerCase()));
  for (const module of activeTermsModules) {
    if (!acceptedSlugs.has(module.document.slug)) {
      return NextResponse.json(
        { ok: false, error: "missing_terms_acceptance", documentSlug: module.document.slug },
        { status: 400 },
      );
    }
  }

  const { user, canonicalArtist } = context;
  const now = new Date();
  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent") || undefined;
  const acceptedName = parsed.data.terms.acceptedName.trim();

  for (const module of activeTermsModules) {
    const bodyMarkdown = module.version.bodyMarkdown || "";
    const snapshotHash = createHash("sha256").update(bodyMarkdown).digest("hex");
    await TermsAcceptanceModel.findOneAndUpdate(
      {
        userId: user._id,
        documentSlug: module.document.slug,
        version: module.version.version,
      },
      {
        $set: {
          versionId: module.version.id,
          acceptedAt: now,
          acceptedName,
          ip,
          userAgent,
          snapshotHash,
        },
      },
      { upsert: true },
    );
  }

  const galleryUrls = normalizeGalleryUrls(parsed.data.profileImages.galleryUrls || []);
  const avatarUrl = parsed.data.profileImages.avatarUrl.trim();
  const heroUrl = parsed.data.profileImages.heroUrl.trim();
  const city = parsed.data.personal.city.trim();
  const country = parsed.data.personal.country.trim();
  const bio = parsed.data.personal.bio.trim();
  const handle = parsed.data.shopify.handle.trim();
  const displayName = parsed.data.shopify.displayName.trim();
  const instagram = parsed.data.shopify.instagram.trim();
  const syncMode = getArtistShopifySyncMode();
  const minimalChangedFields: string[] = [];
  if ((canonicalArtist.handle || "") !== handle) minimalChangedFields.push("handle");
  if ((canonicalArtist.displayName || "") !== displayName) minimalChangedFields.push("displayName");

  const legacyChangedFields: string[] = [
    "handle",
    "displayName",
    "instagram",
    "profileImages.avatarUrl",
    "profileImages.heroUrl",
    "profileImages.galleryUrls",
    "consents.allowOriginalSales",
    "consents.allowPrintSales",
    "consents.allowRental",
    "consents.allowExhibitions",
    "consents.presentationOnly",
  ];

  const changedFieldsForSync = syncMode === "legacy" ? legacyChangedFields : minimalChangedFields;
  const dirtyFields =
    changedFieldsForSync.length > 0
      ? Array.from(
          new Set([
            ...(Array.isArray(canonicalArtist.sync?.dirtyFields) ? canonicalArtist.sync?.dirtyFields : []),
            ...changedFieldsForSync,
          ]),
        )
      : [];

  const setPayload: Record<string, unknown> = {
    handle,
    displayName,
    email: user.email,
    instagram: instagram || undefined,
    profileImages: {
      avatarUrl: avatarUrl || undefined,
      heroUrl: heroUrl || undefined,
      galleryUrls,
    },
    locationCity: city || undefined,
    locationCountry: country || undefined,
    bio: bio || undefined,
    consents: {
      allowOriginalSales: parsed.data.consents.sellOriginals,
      allowPrintSales: parsed.data.consents.sellPrints,
      allowRental: parsed.data.consents.rental,
      allowExhibitions: parsed.data.consents.exhibitions,
      presentationOnly: parsed.data.consents.presentationOnly,
    },
  };
  if (dirtyFields.length > 0) {
    setPayload["sync.needsPush"] = true;
    setPayload["sync.dirtyAt"] = now;
    setPayload["sync.dirtyFields"] = dirtyFields;
  }

  await CanonicalArtistModel.updateOne(
    { _id: canonicalArtist._id },
    {
      $set: setPayload,
    },
  );

  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        name: parsed.data.personal.fullName.trim(),
        onboardingComplete: true,
      },
    },
  );

  const accepted = await TermsAcceptanceModel.find({ userId: user._id }).sort({ acceptedAt: -1 }).lean();

  if (user.onboardingComplete !== true) {
    await sendEmail({
      to: user.email,
      subject: "Artclub onboarding completed",
      text: "Your artist onboarding is complete. You can now manage your workspace at /artists.",
      html: "<p>Your artist onboarding is complete.</p><p>You can now manage your workspace at <strong>/artists</strong>.</p>",
    }).catch(() => null);
  }

  return NextResponse.json(
    {
      ok: true,
      onboardingComplete: true,
      artistKey: user.artistKey,
      acceptedTerms: accepted.map((entry) => ({
        id: entry._id.toString(),
        documentSlug: entry.documentSlug,
        version: entry.version,
        versionId: entry.versionId?.toString() || null,
        acceptedAt: entry.acceptedAt,
        acceptedName: entry.acceptedName || "",
        snapshotHash: entry.snapshotHash,
      })),
    },
    { status: 200 },
  );
}
