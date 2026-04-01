import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { getS3ObjectUrl, tryExtractS3KeyFromUrl } from "@/lib/server/s3";
import { ArtistMediaV2Model } from "@/lib/server/models";

export async function resolveArtistMediaFileResponse(id: string, options?: { requireOwnership?: boolean }) {
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_media_id" }, { status: 400 });
  }

  const requireOwnership = options?.requireOwnership !== false;
  const auth = requireOwnership ? await requireArtistApiContext({ allowIncompleteOnboarding: true }) : null;
  if (requireOwnership && (!auth || !auth.ok)) {
    return auth?.response || NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const filter: Record<string, unknown> = { _id: id };
  if (requireOwnership && auth?.ok) {
    filter.shopDomain = auth.context.user.shopDomain;
    filter.artistKey = auth.context.user.artistKey;
  }

  const media = await ArtistMediaV2Model.findOne(filter)
    .select({ s3Key: 1, previewUrl: 1, url: 1 })
    .lean();
  if (!media) {
    return NextResponse.json({ ok: false, error: "media_not_found" }, { status: 404 });
  }

  const resolvedS3Key = media.s3Key || tryExtractS3KeyFromUrl(media.url) || tryExtractS3KeyFromUrl(media.previewUrl);
  const targetUrl = resolvedS3Key
    ? await getS3ObjectUrl(resolvedS3Key, 15 * 60).catch(() => media.previewUrl || media.url)
    : media.previewUrl || media.url;

  if (!targetUrl) {
    return NextResponse.json({ ok: false, error: "media_url_unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(targetUrl, { status: 302 });
}
