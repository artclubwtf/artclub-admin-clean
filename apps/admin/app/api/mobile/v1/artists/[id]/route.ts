import { NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";

function isMetaobjectId(id: string) {
  return id.startsWith("gid://");
}

function normalizeArtistName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function buildArtistKeyStages(): PipelineStage[] {
  return [
    {
      $addFields: {
        artistKey: {
          $toLower: {
            $trim: { input: { $ifNull: ["$artistName", ""] } },
          },
        },
      },
    },
    {
      $addFields: {
        artistKey: {
          $regexReplace: {
            input: "$artistKey",
            regex: /\s+/g,
            replacement: "-",
          },
        },
      },
    },
    {
      $addFields: {
        artistKey: {
          $regexReplace: {
            input: "$artistKey",
            regex: /[^a-z0-9-]+/g,
            replacement: "",
          },
        },
      },
    },
  ];
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const rawId = decodeURIComponent(params.id || "").trim();
    if (!rawId) {
      return NextResponse.json({ error: "artist id is required" }, { status: 400 });
    }

    await connectMongo();

    const metaobject = isMetaobjectId(rawId);
    const normalizedId = metaobject ? rawId : normalizeArtistName(rawId);

    let name = rawId.replace(/-/g, " ").trim();
    let avatarUrl: string | undefined;
    let bio: string | undefined;
    let instagramUrl: string | undefined;

    if (metaobject) {
      const artist = await ArtistModel.findOne({ "shopifySync.metaobjectId": rawId }).lean();
      if (artist) {
        name = artist.publicProfile?.displayName || artist.publicProfile?.name || artist.name || name;
        avatarUrl = artist.publicProfile?.heroImageUrl || artist.publicProfile?.bild_1 || undefined;
        bio = artist.publicProfile?.bio || undefined;
        instagramUrl = artist.publicProfile?.instagram || undefined;
      }
    }

    if (!name || name === rawId) {
      const pipeline: PipelineStage[] = [];
      if (metaobject) {
        pipeline.push({ $match: { artistMetaobjectGid: rawId } });
      } else {
        pipeline.push(...buildArtistKeyStages(), { $match: { artistKey: normalizedId } });
      }
      pipeline.push({ $limit: 1 }, { $project: { artistName: 1 } });
      const docs = await ShopifyArtworkCacheModel.aggregate(pipeline).exec();
      if (docs[0]?.artistName) {
        name = docs[0].artistName;
      }
    }

    let artworksCount = 0;
    if (metaobject) {
      artworksCount = await ShopifyArtworkCacheModel.countDocuments({ artistMetaobjectGid: rawId });
    } else {
      const pipeline = [
        ...buildArtistKeyStages(),
        { $match: { artistKey: normalizedId } },
        { $count: "total" },
      ];
      const result = await ShopifyArtworkCacheModel.aggregate(pipeline).exec();
      artworksCount = result[0]?.total ?? 0;
    }

    return NextResponse.json(
      {
        ok: true,
        artist: {
          id: metaobject ? rawId : normalizedId || rawId,
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
