import { SettingsForm } from "@/components/settings/SettingsForm";
import { requireArtistContext } from "@/lib/server/artist-context";
import { NetworkSettings } from "@/components/network/NetworkSettings";
import { requireNetworkContext } from "@/lib/server/network-context";
import { isNetworkMvpEnabled } from "@/lib/server/network-flags";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SettingsPage() {
  if (isNetworkMvpEnabled()) { const network = await requireNetworkContext(); return <NetworkSettings artist={network.profile!.profileType === "artist"} />; }
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
