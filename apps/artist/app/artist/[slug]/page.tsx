import { notFound } from "next/navigation";

import { UnifiedProfileView } from "@/components/profile/UnifiedProfileView";
import { loadPublicArtistPageBySlug } from "@/lib/server/public-artist-page";
import { resolveUnifiedProfileBySlug } from "@/lib/server/unified-profile";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ArtistPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [profile, unified] = await Promise.all([loadPublicArtistPageBySlug(slug), resolveUnifiedProfileBySlug(slug)]);

  if (!profile) {
    notFound();
  }

  const summary = unified || { id:`artist:${profile.canonicalArtistId}`, canonicalArtistId:profile.canonicalArtistId, userId:"", profileType:"artist", slug:profile.slug, displayName:profile.displayName, username:profile.slug, bio:profile.bio||"", city:"", country:"", disciplines:[], interests:[], website:"", instagram:"", profileImageUrl:profile.avatarUrl, coverImageUrl:profile.heroUrl, isPublic:true, isVerified:false, donationEnabled:false };
  return <UnifiedProfileView profile={summary} artistProfile={profile} viewerMode="public" />;
}
