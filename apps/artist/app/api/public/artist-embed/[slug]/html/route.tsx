import { NextResponse } from "next/server";
import { renderToStaticMarkup } from "react-dom/server.edge";

import { PublicArtistProfileView } from "@/components/public-profile/PublicArtistProfileView";
import { buildPublicCorsHeaders } from "@/lib/publicCors";
import { loadPublicArtistPageBySlug } from "@/lib/server/public-artist-page";
import type { PublicArtistProfilePageData } from "@/lib/types";

function absolutizeUrl(value: string, origin: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    return new URL(normalized, origin).toString();
  } catch {
    return normalized;
  }
}

function absolutizeProfile(profile: PublicArtistProfilePageData, origin: string): PublicArtistProfilePageData {
  return {
    ...profile,
    avatarUrl: absolutizeUrl(profile.avatarUrl || "", origin),
    heroUrl: absolutizeUrl(profile.heroUrl || "", origin),
    artworks: profile.artworks.map((artwork) => ({
      ...artwork,
      imageUrl: absolutizeUrl(artwork.imageUrl || "", origin),
      galleryUrls: Array.isArray(artwork.galleryUrls) ? artwork.galleryUrls.map((value) => absolutizeUrl(value, origin)) : [],
    })),
    exhibitionHistory: profile.exhibitionHistory.map((item) => ({
      ...item,
      coverImageUrl: absolutizeUrl(item.coverImageUrl || "", origin),
    })),
    upcomingExhibitions: profile.upcomingExhibitions.map((item) => ({
      ...item,
      coverImageUrl: absolutizeUrl(item.coverImageUrl || "", origin),
    })),
    education: profile.education.map((item) => ({
      ...item,
      imageUrl: absolutizeUrl(item.imageUrl || "", origin),
    })),
    experience: profile.experience.map((item) => ({
      ...item,
      imageUrl: absolutizeUrl(item.imageUrl || "", origin),
    })),
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildPublicCorsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = {
    ...buildPublicCorsHeaders(req.headers.get("origin")),
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  };

  try {
    const profile = await loadPublicArtistPageBySlug(slug);
    if (!profile) {
      return new NextResponse('<div class="text-sm text-neutral-400">Artist not found.</div>', { status: 404, headers });
    }

    const origin = new URL(req.url).origin;
    const embedProfile = absolutizeProfile(profile, origin);
    const markup = renderToStaticMarkup(
      <PublicArtistProfileView
        profile={embedProfile}
        activeTab="artworks"
        selectedArtwork={null}
        trackingSource="shopify_artist_embed"
      />,
    );

    const html = `${markup}<script type="application/json" data-artclub-artist-embed-payload>${JSON.stringify(embedProfile)}</script>`;
    return new NextResponse(html, { status: 200, headers });
  } catch (error) {
    console.error("Failed to render artist embed HTML", error);
    return new NextResponse('<div class="text-sm text-neutral-400">Artist embed unavailable.</div>', { status: 500, headers });
  }
}
