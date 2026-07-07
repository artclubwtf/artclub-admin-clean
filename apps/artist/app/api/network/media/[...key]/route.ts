import { NextResponse } from "next/server";

import { isSafeNetworkStorageKey } from "@/lib/server/network-media";
import { getS3ObjectUrl } from "@/lib/server/s3";

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");
  if (!isSafeNetworkStorageKey(key)) return NextResponse.json({ ok: false, error: "invalid_media_key" }, { status: 400 });
  const target = await getS3ObjectUrl(key, 60 * 60).catch(() => "");
  if (!target) return NextResponse.json({ ok: false, error: "media_unavailable" }, { status: 404 });
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400" } });
}
