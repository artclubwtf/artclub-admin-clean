import { EarningsDashboard } from "@/components/earnings/EarningsDashboard";
import { requireArtistContext } from "@/lib/server/artist-context";
import { loadArtistEarnings } from "@/lib/server/artist-earnings";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function EarningsPage() {
  const context = await requireArtistContext();
  const earnings = await loadArtistEarnings(context);

  return <EarningsDashboard earnings={earnings} />;
}
