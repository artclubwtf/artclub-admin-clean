import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { requireOnboardingContext } from "@/lib/server/artist-context";
import { TermsAcceptanceModel } from "@/lib/server/models";
import { ensureTermsDocument, loadActiveTermsModules } from "@/lib/server/terms";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function OnboardingPage() {
  const context = await requireOnboardingContext();
  await ensureTermsDocument("artist_registration_terms");
  if (context.user.onboardingComplete) {
    redirect("/");
  }

  const activeTerms = await loadActiveTermsModules();
  await TermsAcceptanceModel.find({ userId: context.user._id }).sort({ acceptedAt: -1 }).lean();

  return (
    <OnboardingForm
      initial={{
        fullName: context.user.name || context.canonicalArtist.displayName || "",
        email: context.user.email,
        city: context.canonicalArtist.locationCity || "",
        country: context.canonicalArtist.locationCountry || "",
        bio: context.canonicalArtist.bio || "",
        handle: context.canonicalArtist.handle || context.user.artistKey,
        displayName: context.canonicalArtist.displayName || context.user.name || "",
        avatarUrl: context.canonicalArtist.profileImages?.avatarUrl || "",
        heroUrl: context.canonicalArtist.profileImages?.heroUrl || "",
        galleryUrls: Array.isArray(context.canonicalArtist.profileImages?.galleryUrls) ? context.canonicalArtist.profileImages.galleryUrls : [],
        consents: {
          allowOriginalSales: context.canonicalArtist.consents?.allowOriginalSales === true,
          allowPrintSales: context.canonicalArtist.consents?.allowPrintSales === true,
          allowRental: context.canonicalArtist.consents?.allowRental === true,
          allowExhibitions: context.canonicalArtist.consents?.allowExhibitions === true,
        },
        activeTerms,
      }}
    />
  );
}
