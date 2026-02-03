import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

function isMetaobjectId(id: string) {
  return id.startsWith("gid://");
}

function buildArtistNameRegex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const pattern = `^\\s*${parts.join("\\s+")}\\s*$`;
  return new RegExp(pattern, "i");
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rawId = decodeURIComponent(id || "").trim();
    if (!rawId) {
      return NextResponse.json({ error: "artist id is required" }, { status: 400 });
    }

    await connectMongo();

    const metaobject = isMetaobjectId(rawId);
    const artistRegex = metaobject ? null : buildArtistNameRegex(rawId);

    let name = rawId.replace(/-/g, " ").trim();
    let avatarUrl: string | undefined;
    let bio: string | undefined;
    let instagramUrl: string | undefined;

    if (metaobject) {
      const artist = await ArtistModel.findOne({ "shopifySync.metaobjectId": rawId }).lean();
      if (artist) {
        name = artist.publicProfile?.displayName || artist.publicProfile?.name || artist.name || name;
        avatarUrl =
          artist.publicProfile?.heroImageUrl ||
          artist.publicProfile?.bild_1 ||
          artist.publicProfile?.bild_2 ||
          artist.publicProfile?.bild_3 ||
          undefined;
        bio = artist.publicProfile?.bio || artist.publicProfile?.text_1 || artist.publicProfile?.einleitung_1 || undefined;
        instagramUrl = artist.publicProfile?.instagram || undefined;
      }
    }

    if (!name || name === rawId) {
      const match = metaobject
        ? { artistMetaobjectGid: rawId }
        : artistRegex
          ? { artistName: { $regex: artistRegex } }
          : null;
      if (match) {
        const doc = await ShopifyArtworkCacheModel.findOne(match).select({ artistName: 1 }).lean();
        if (doc?.artistName) {
          name = doc.artistName;
        }
      }
    }

    let artworksCount = 0;
    if (metaobject) {
      artworksCount = await ShopifyArtworkCacheModel.countDocuments({ artistMetaobjectGid: rawId });
    } else {
      if (artistRegex) {
        artworksCount = await ShopifyArtworkCacheModel.countDocuments({ artistName: { $regex: artistRegex } });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        artist: {
          id: metaobject ? rawId : rawId,
          name: name || rawId,
          avatarUrl: avatarUrl || undefined,
          bio: bio || undefined,
          instagramUrl: instagramUrl || undefined,
        },
        counts: { artworks: artworksCount },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to load artist profile", err);
    const message = err instanceof Error ? err.message : "Failed to load artist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
