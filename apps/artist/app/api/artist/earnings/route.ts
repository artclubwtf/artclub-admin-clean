import { NextResponse } from "next/server";

import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { loadArtistEarnings } from "@/lib/server/artist-earnings";

export async function GET() {
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;

  try {
    const earnings = await loadArtistEarnings(auth.context);
    return NextResponse.json(earnings, { status: 200 });
  } catch (error) {
    return artistApiErrorResponse(error, "artist_earnings_failed");
  }
}
