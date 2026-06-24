import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { queueArtistPushJob } from "@/lib/sync/shopifySyncJobs";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as { canonicalArtistId?: string | null } | null;
  const canonicalArtistId = body?.canonicalArtistId?.trim() || "";
  if (!Types.ObjectId.isValid(canonicalArtistId)) {
    return NextResponse.json({ ok: false, error: "invalid_canonical_artist_id" }, { status: 400 });
  }

  await connectMongo();

  const artist = await CanonicalArtistModel.findById(canonicalArtistId)
    .select({ _id: 1, shopDomain: 1, artistKey: 1, publicSlug: 1, appUrl: 1, shopifyMetaobjectId: 1, shopify: 1, sync: 1 })
    .lean();
  if (!artist?._id) {
    return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404 });
  }

  const job = await queueArtistPushJob({
    canonicalArtistId: String(artist._id),
    shopDomain: artist.shopDomain,
    artistKey: artist.artistKey,
    reason: "admin_requeue_artist",
    payload: {
      source: "admin_requeue_artist",
      canonicalArtistId: String(artist._id),
      artistKey: artist.artistKey,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      job: {
        id: String(job._id),
        type: job.type,
        status: job.status,
        artistKey: job.artistKey || artist.artistKey,
        canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : String(artist._id),
        nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : null,
      },
      artist: {
        canonicalArtistId: String(artist._id),
        artistKey: artist.artistKey,
        publicSlug: artist.publicSlug || null,
        appUrl: artist.appUrl || null,
        shopifyMetaobjectGid: artist.shopify?.metaobjectGid || artist.shopifyMetaobjectId || null,
        syncStatus: artist.sync?.status || null,
      },
    },
    { status: 200 },
  );
}
