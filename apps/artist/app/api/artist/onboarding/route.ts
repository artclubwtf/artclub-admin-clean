import { NextResponse } from "next/server";
import { z } from "zod";

import { buildArtistSyncPatch } from "@/lib/server/artist-sync";
import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { normalizePublicArtistMediaUrl, normalizePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { buildTermsSnapshotHash, ensureTermsDocument, loadActiveTermsModules } from "@/lib/server/terms";
import { CanonicalArtistModel, TermsAcceptanceModel, UserModel } from "@/lib/server/models";

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
    profile: z
      .object({
        handle: z.string().trim().min(2),
        displayName: z.string().trim().min(2),
        avatarUrl: z.string().trim().optional().default(""),
        heroUrl: z.string().trim().optional().default(""),
        galleryUrls: z.array(z.string().trim()).optional().default([]),
      })
      .strict(),
    consents: z
      .object({
        allowOriginalSales: z.boolean(),
        allowPrintSales: z.boolean(),
        allowRental: z.boolean(),
        allowExhibitions: z.boolean(),
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

function normalizeGalleryUrls(input: string[]) {
  return normalizePublicArtistMediaUrls(input.map((value) => value.trim()).filter(Boolean)).slice(0, 10);
}

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",").map((part) => part.trim());
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || undefined;
}

export async function GET() {
  const auth = await requireArtistApiContext({ allowIncompleteOnboarding: true });
  if (!auth.ok) return auth.response;
  const { context } = auth;
  await ensureTermsDocument("artist_registration_terms");

  const activeTermsModules = await loadActiveTermsModules();
  const accepted = await TermsAcceptanceModel.find({ userId: context.user._id }).sort({ acceptedAt: -1 }).lean();

  return NextResponse.json(
    {
      ok: true,
      onboardingComplete: context.user.onboardingComplete === true,
      artistKey: context.user.artistKey,
      personal: {
        fullName: context.user.name || context.canonicalArtist.displayName || "",
        email: context.user.email,
        city: context.canonicalArtist.locationCity || "",
        country: context.canonicalArtist.locationCountry || "",
        bio: context.canonicalArtist.bio || "",
      },
      profile: {
        handle: context.canonicalArtist.handle || context.user.artistKey,
        displayName: context.canonicalArtist.displayName || context.user.name || "",
        avatarUrl: context.canonicalArtist.profileImages?.avatarUrl || "",
        heroUrl: context.canonicalArtist.profileImages?.heroUrl || "",
        galleryUrls: Array.isArray(context.canonicalArtist.profileImages?.galleryUrls)
          ? context.canonicalArtist.profileImages.galleryUrls
          : [],
      },
      consents: {
        allowOriginalSales: context.canonicalArtist.consents?.allowOriginalSales === true,
        allowPrintSales: context.canonicalArtist.consents?.allowPrintSales === true,
        allowRental: context.canonicalArtist.consents?.allowRental === true,
        allowExhibitions: context.canonicalArtist.consents?.allowExhibitions === true,
      },
      terms: {
        activeModules: activeTermsModules,
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
  try {
    const auth = await requireArtistApiContext({ allowIncompleteOnboarding: true });
    if (!auth.ok) return auth.response;
    const { context } = auth;
    await ensureTermsDocument("artist_registration_terms");

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

    const now = new Date();
    const ip = getRequestIp(req);
    const userAgent = req.headers.get("user-agent") || undefined;
    const acceptedName = parsed.data.terms.acceptedName.trim();

    for (const module of activeTermsModules) {
      await TermsAcceptanceModel.findOneAndUpdate(
        {
          userId: context.user._id,
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
            snapshotHash: buildTermsSnapshotHash(module.version.bodyMarkdown),
          },
        },
        { upsert: true },
      );
    }

    const avatarUrl = normalizePublicArtistMediaUrl(parsed.data.profile.avatarUrl.trim());
    const heroUrl = normalizePublicArtistMediaUrl(parsed.data.profile.heroUrl.trim());
    const galleryUrls = normalizeGalleryUrls(parsed.data.profile.galleryUrls || []);
    const artistChangedFields: string[] = [];
    if ((context.canonicalArtist.handle || "") !== parsed.data.profile.handle.trim()) artistChangedFields.push("handle");
    if ((context.canonicalArtist.displayName || "") !== parsed.data.profile.displayName.trim()) artistChangedFields.push("displayName");
    if ((context.canonicalArtist.locationCity || "") !== parsed.data.personal.city.trim()) artistChangedFields.push("locationCity");
    if ((context.canonicalArtist.locationCountry || "") !== parsed.data.personal.country.trim()) artistChangedFields.push("locationCountry");
    if ((context.canonicalArtist.bio || "") !== parsed.data.personal.bio.trim()) artistChangedFields.push("bio");
    if ((context.canonicalArtist.profileImages?.avatarUrl || "") !== avatarUrl) artistChangedFields.push("profileImages.avatarUrl");
    if ((context.canonicalArtist.profileImages?.heroUrl || "") !== heroUrl) artistChangedFields.push("profileImages.heroUrl");
    if (JSON.stringify(context.canonicalArtist.profileImages?.galleryUrls || []) !== JSON.stringify(galleryUrls)) {
      artistChangedFields.push("profileImages.galleryUrls");
    }
    if ((context.canonicalArtist.consents?.allowOriginalSales === true) !== parsed.data.consents.allowOriginalSales) {
      artistChangedFields.push("consents.allowOriginalSales");
    }
    if ((context.canonicalArtist.consents?.allowPrintSales === true) !== parsed.data.consents.allowPrintSales) {
      artistChangedFields.push("consents.allowPrintSales");
    }
    if ((context.canonicalArtist.consents?.allowRental === true) !== parsed.data.consents.allowRental) {
      artistChangedFields.push("consents.allowRental");
    }
    if ((context.canonicalArtist.consents?.allowExhibitions === true) !== parsed.data.consents.allowExhibitions) {
      artistChangedFields.push("consents.allowExhibitions");
    }

    const syncPatch = buildArtistSyncPatch({
      currentDirtyFields: context.canonicalArtist.sync?.dirtyFields,
      changedFields: artistChangedFields,
      now,
    });

    await CanonicalArtistModel.updateOne(
      { _id: context.canonicalArtist._id },
      {
        $set: {
          handle: parsed.data.profile.handle.trim(),
          displayName: parsed.data.profile.displayName.trim(),
          email: context.user.email,
          locationCity: parsed.data.personal.city.trim() || undefined,
          locationCountry: parsed.data.personal.country.trim() || undefined,
          bio: parsed.data.personal.bio.trim() || undefined,
          profileImages: {
            avatarUrl: avatarUrl || undefined,
            heroUrl: heroUrl || undefined,
            galleryUrls,
          },
          consents: {
            allowOriginalSales: parsed.data.consents.allowOriginalSales,
            allowPrintSales: parsed.data.consents.allowPrintSales,
            allowRental: parsed.data.consents.allowRental,
            allowExhibitions: parsed.data.consents.allowExhibitions,
            presentationOnly: false,
          },
          ...syncPatch,
        },
      },
    );

    await UserModel.updateOne(
      { _id: context.user._id },
      {
        $set: {
          name: parsed.data.personal.fullName.trim(),
          onboardingComplete: true,
        },
      },
    );

    return NextResponse.json({ ok: true, onboardingComplete: true }, { status: 200 });
  } catch (error) {
    return artistApiErrorResponse(error, "onboarding_save_failed");
  }
}
