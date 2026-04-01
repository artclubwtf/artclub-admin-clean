import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import { ArtistMediaV2Model, CanonicalArtistModel } from "@/lib/server/models";

function matchesUrl(candidate: string | undefined, targets: string[]) {
  return !!candidate && targets.includes(candidate);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo();
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

  const targetUrls = [media.url, media.previewUrl].filter(Boolean) as string[];
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
