import { notFound } from "next/navigation";

import { PublicArtistProfilePage } from "@/components/public-profile/PublicArtistProfilePage";
import { loadPublicArtistPageBySlug } from "@/lib/server/public-artist-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ArtistPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await loadPublicArtistPageBySlug(slug);

  if (!profile) {
    notFound();
  }

  return <PublicArtistProfilePage profile={profile} />;
}
