import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { loadArtistMatchingOverview } from "@/lib/migration/matching";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await loadArtistMatchingOverview();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "artist_matching_load_failed" },
      { status: 500 },
    );
  }
}
