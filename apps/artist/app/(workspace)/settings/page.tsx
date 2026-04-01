import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireArtistContext } from "@/lib/server/artist-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SettingsPage() {
  const context = await requireArtistContext();

  return (
    <SettingsForm
      initialConsents={{
        allowOriginalSales: context.canonicalArtist.consents?.allowOriginalSales === true,
        allowPrintSales: context.canonicalArtist.consents?.allowPrintSales === true,
        allowRental: context.canonicalArtist.consents?.allowRental === true,
        allowExhibitions: context.canonicalArtist.consents?.allowExhibitions === true,
      }}
    />
  );
}
