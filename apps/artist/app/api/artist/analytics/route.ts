import { NextResponse } from "next/server";

import { artistAnalyticsRange } from "@artclub/models";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { loadArtistAnalytics } from "@/lib/server/artist-analytics";

export async function GET(req: Request) {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const rangeResult = artistAnalyticsRange.safeParse(searchParams.get("range") || "30d");
    if (!rangeResult.success) {
      return NextResponse.json({ ok: false, error: "invalid_range" }, { status: 400 });
    }

    const analytics = await loadArtistAnalytics(auth.context, rangeResult.data);
    return NextResponse.json(analytics, { status: 200 });
  } catch (error) {
    return artistApiErrorResponse(error, "artist_analytics_failed");
  }
}
