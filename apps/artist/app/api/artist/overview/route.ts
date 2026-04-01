import { NextResponse } from "next/server";

import { requireArtistApiContext } from "@/lib/server/artist-context";
import { connectMongo } from "@/lib/server/mongodb";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel } from "@/lib/server/models";

function computeProfileCompleteness(input: {
  displayName?: string;
  bio?: string;
  locationCity?: string;
  locationCountry?: string;
  avatarUrl?: string;
  heroUrl?: string;
  galleryUrls?: string[];
}) {
  const checks = [
    Boolean(input.displayName),
    Boolean(input.bio),
    Boolean(input.locationCity || input.locationCountry),
    Boolean(input.avatarUrl),
    Boolean(input.heroUrl),
    Boolean((input.galleryUrls || []).length),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export async function GET() {
  await connectMongo();
  const auth = await requireArtistApiContext();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const [artworkCount, seriesCount, recentMedia] = await Promise.all([
    CanonicalProductModel.countDocuments({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      type: "artwork",
    }),
    ArtistSeriesModel.countDocuments({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    }),
    ArtistMediaV2Model.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      overview: {
        artworkCount,
        seriesCount,
        profileCompleteness: computeProfileCompleteness({
          displayName: context.canonicalArtist.displayName,
          bio: context.canonicalArtist.bio,
          locationCity: context.canonicalArtist.locationCity,
          locationCountry: context.canonicalArtist.locationCountry,
          avatarUrl: context.canonicalArtist.profileImages?.avatarUrl,
          heroUrl: context.canonicalArtist.profileImages?.heroUrl,
          galleryUrls: context.canonicalArtist.profileImages?.galleryUrls,
        }),
        recentMedia: recentMedia.map((item) => ({
          id: item._id.toString(),
          kind: item.kind,
          url: item.previewUrl || item.url,
          createdAt: item.createdAt,
        })),
      },
    },
    { status: 200 },
  );
}
