import { artistAnalyticsRange } from "@artclub/models";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { requireArtistContext } from "@/lib/server/artist-context";
import { loadArtistAnalytics } from "@/lib/server/artist-analytics";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireArtistContext();
  const resolvedSearchParams = (await searchParams) || {};
  const rawRange = Array.isArray(resolvedSearchParams.range) ? resolvedSearchParams.range[0] : resolvedSearchParams.range;
  const parsedRange = artistAnalyticsRange.safeParse(rawRange || "30d");
  const range = parsedRange.success ? parsedRange.data : "30d";
  const analytics = await loadArtistAnalytics(context, range);

  return <AnalyticsDashboard analytics={analytics} />;
}
