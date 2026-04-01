import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { buildArtistMediaAssetUrl } from "@/lib/server/artist-media";
import { getS3ObjectUrl, tryExtractS3KeyFromUrl } from "@/lib/server/s3";
import { ArtistMediaV2Model, CanonicalArtistModel } from "@/lib/server/models";

function matchesUrl(candidate: string | undefined, targets: string[]) {
  return !!candidate && targets.includes(candidate);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApiContext({ allowIncompleteOnboarding: true });
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_media_id" }, { status: 400 });
  }

  const media = await ArtistMediaV2Model.findOne({
    _id: id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  })
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

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApiContext({ allowIncompleteOnboarding: true });
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_media_id" }, { status: 400 });
  }

  const media = await ArtistMediaV2Model.findOne({
    _id: id,
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
  }).lean();
  if (!media) {
    return NextResponse.json({ ok: false, error: "media_not_found" }, { status: 404 });
  }

  await ArtistMediaV2Model.deleteOne({ _id: media._id });

  const targetUrls = [media.url, media.previewUrl, media.s3Key ? buildArtistMediaAssetUrl(media._id) : ""].filter(Boolean) as string[];
  const currentGallery = Array.isArray(context.canonicalArtist.profileImages?.galleryUrls)
    ? context.canonicalArtist.profileImages.galleryUrls
    : [];
  const nextGallery = currentGallery.filter((url) => !targetUrls.includes(url));

  await CanonicalArtistModel.updateOne(
    { _id: context.canonicalArtist._id },
    {
      $set: {
        "profileImages.avatarUrl": matchesUrl(context.canonicalArtist.profileImages?.avatarUrl, targetUrls)
          ? undefined
          : context.canonicalArtist.profileImages?.avatarUrl,
        "profileImages.heroUrl": matchesUrl(context.canonicalArtist.profileImages?.heroUrl, targetUrls)
          ? undefined
          : context.canonicalArtist.profileImages?.heroUrl,
        "profileImages.galleryUrls": nextGallery,
      },
    },
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
