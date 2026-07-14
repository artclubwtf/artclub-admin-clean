import { ArtistTopbar } from "@/components/layout/ArtistTopbar";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { OverviewPanels } from "@/components/overview/OverviewPanels";
import { requireArtistContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel } from "@/lib/server/models";
import { artistProductOwnershipFilter } from "@/lib/server/product-ownership";
import { isNetworkMvpEnabled } from "@/lib/server/network-flags";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

export default async function HomePage() {
  if (isNetworkMvpEnabled()) redirect("/home");
  const context = await requireArtistContext();

  const [artworkCount, seriesCount, recentMedia] = await Promise.all([
    CanonicalProductModel.countDocuments({
      ...artistProductOwnershipFilter(context),
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

  return (
    <WorkspaceShell topbar={<ArtistTopbar context={context} />}>
      <OverviewPanels
        overview={{
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
            url: resolveArtistMediaUrls(item).url,
            previewUrl: resolveArtistMediaUrls(item).previewUrl,
            filename: item.filename || item.kind,
          })),
        }}
      />
    </WorkspaceShell>
  );
}
