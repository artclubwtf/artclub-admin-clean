import { NextResponse } from "next/server";

import { isShopifyWriteEnabled } from "@/lib/featureFlags";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  extractShopifyArtistMetaobjectMapping,
  matchesArtistSlug,
  type ShopifyArtistMetaobjectNode,
} from "@/lib/sync/shopifyMapping";
import { createSyncRunId, logShopifyDiagnostics, logSyncError } from "@/lib/sync/syncLogger";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";

type ShopifyGraphQLResponse<TData> = {
  data?: TData;
  errors?: unknown;
};

type ArtistDiagnosticsByHandleResponse = {
  metaobjectByHandle?: ShopifyArtistMetaobjectNode | null;
};

type ArtistDiagnosticsListResponse = {
  metaobjects?: {
    edges?: Array<{ node?: ShopifyArtistMetaobjectNode | null }> | null;
  } | null;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function envFlagValue(name: string) {
  return (process.env[name] || "").trim() || null;
}

async function callShopifyAdmin<TData>(query: string, variables: Record<string, unknown>): Promise<TData | undefined> {
  const shopDomain = resolveShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN);
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shopDomain || !token) {
    throw new Error("Missing Shopify credentials");
  }

  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shopDomain}/admin/api/${version}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const text = await res.text();
  const json = JSON.parse(text) as ShopifyGraphQLResponse<TData>;
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  if (json.errors) throw new Error("Shopify GraphQL errors");
  return json.data;
}

async function fetchArtistMetaobject(slug: string) {
  const byHandleQuery = `
    query ArtistDiagnosticsByHandle($handle: String!) {
      metaobjectByHandle(handle: { type: "kunstler", handle: $handle }) {
        id
        handle
        type
        displayName
        fields {
          key
          type
          value
          reference {
            __typename
            ... on MediaImage {
              id
              image {
                url
                altText
                width
                height
              }
            }
            ... on GenericFile {
              id
              url
            }
          }
          references(first: 10) {
            nodes {
              __typename
              ... on MediaImage {
                id
                image {
                  url
                  altText
                  width
                  height
                }
              }
              ... on GenericFile {
                id
                url
              }
            }
          }
        }
      }
    }
  `;

  const byHandle = await callShopifyAdmin<ArtistDiagnosticsByHandleResponse>(byHandleQuery, { handle: slug });
  if (byHandle?.metaobjectByHandle) {
    return { metaobject: byHandle.metaobjectByHandle, source: "metaobjectByHandle" as const };
  }

  const listQuery = `
    query ArtistDiagnosticsList($first: Int!) {
      metaobjects(type: "kunstler", first: $first) {
        edges {
          node {
            id
            handle
            type
            displayName
            fields {
              key
              type
              value
              reference {
                __typename
                ... on MediaImage {
                  id
                  image {
                    url
                    altText
                    width
                    height
                  }
                }
                ... on GenericFile {
                  id
                  url
                }
              }
              references(first: 10) {
                nodes {
                  __typename
                  ... on MediaImage {
                    id
                    image {
                      url
                      altText
                      width
                      height
                    }
                  }
                  ... on GenericFile {
                    id
                    url
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const list = await callShopifyAdmin<ArtistDiagnosticsListResponse>(listQuery, { first: 100 });
  const nodes = (list?.metaobjects?.edges || []).map((edge) => edge?.node).filter(Boolean) as ShopifyArtistMetaobjectNode[];
  const metaobject = nodes.find((node) => matchesArtistSlug(node, slug)) || null;
  return { metaobject, source: "metaobjectsFirst100" as const };
}

function canonicalArtistPayload(artist: any) {
  return {
    canonicalArtistId: artist ? String(artist._id) : null,
    artistKey: artist?.artistKey || null,
    handle: artist?.handle || null,
    publicSlug: artist?.publicSlug || null,
    displayName: artist?.displayName || null,
    appUrl: artist?.appUrl || null,
    coverImageUrl: artist?.profileImages?.heroUrl || null,
    galleryImageCount: Array.isArray(artist?.profileImages?.galleryUrls) ? artist.profileImages.galleryUrls.length : 0,
    galleryImageUrls: Array.isArray(artist?.profileImages?.galleryUrls) ? artist.profileImages.galleryUrls : [],
    instagram: artist?.instagram || null,
    hasQuote: Boolean(artist?.quote),
    hasIntro: Boolean(artist?.introduction),
    hasLongText: Boolean(artist?.longText),
    shopifyMetaobjectGid: artist?.shopify?.metaobjectGid || artist?.shopifyMetaobjectId || null,
    linkedUserIdExists: Boolean(artist?.linkedUserId),
  };
}

function exactCaseInsensitive(value: string) {
  return new RegExp(`^${escapeRegex(value)}$`, "i");
}

function fallbackDisplayNamePayload(artists: any[]) {
  return artists.map((artist) => ({
    canonicalArtistId: String(artist._id),
    artistKey: artist.artistKey || null,
    handle: artist.handle || null,
    publicSlug: artist.publicSlug || null,
    displayName: artist.displayName || null,
    shopifyMetaobjectGid: artist.shopify?.metaobjectGid || artist.shopifyMetaobjectId || null,
  }));
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  const apply = url.searchParams.get("apply") === "true";
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const runId = createSyncRunId("shopify-diagnostics-artist");
  const shopDomain = resolveShopDomain();
  logShopifyDiagnostics(
    "artist_diagnostics_started",
    {
      runId,
      service: "admin",
      slug,
      shopDomain: shopDomain || null,
      DEBUG_SHOPIFY_SYNC: envFlagValue("DEBUG_SHOPIFY_SYNC"),
      DEBUG_SHOPIFY_SYNC_VERBOSE: envFlagValue("DEBUG_SHOPIFY_SYNC_VERBOSE"),
      SHOPIFY_WRITE_ENABLED: isShopifyWriteEnabled(),
      hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      hasMongoUri: Boolean(process.env.MONGODB_URI),
    },
    { runId, force: true },
  );

  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain", runId }, { status: 500 });
  }

  try {
    await connectMongo();

    const { metaobject, source } = await fetchArtistMetaobject(slug);
    logShopifyDiagnostics(
      "shopify_artist_metaobject_lookup_result",
      {
        slug,
        source,
        metaobjectFound: Boolean(metaobject),
        metaobjectId: metaobject?.id?.trim() || null,
        handle: metaobject?.handle?.trim() || null,
        displayName: metaobject?.displayName?.trim() || null,
      },
      { runId, force: true },
    );

    if (!metaobject) {
      return NextResponse.json({ ok: false, error: "artist_metaobject_not_found", runId, source }, { status: 404 });
    }

    const mapping = extractShopifyArtistMetaobjectMapping(metaobject);
    logShopifyDiagnostics(
      "shopify_artist_metaobject_raw_fields",
      {
        metaobjectId: mapping.metaobjectId,
        handle: mapping.handle,
        type: mapping.type,
        displayName: mapping.displayName,
        fields: mapping.rawFieldSummary,
      },
      { runId, force: true },
    );

    for (const fieldCheck of mapping.fieldMappings) {
      logShopifyDiagnostics(
        "shopify_artist_field_mapping_check",
        fieldCheck,
        { runId, force: true },
      );
    }

    const exact = exactCaseInsensitive(slug);
    const canonicalArtist =
      (await CanonicalArtistModel.findOne({
        shopDomain,
        $or: [
          { publicSlug: exact },
          { handle: exact },
          { artistKey: exact },
          ...(mapping.metaobjectId ? [{ shopifyMetaobjectId: mapping.metaobjectId }, { "shopify.metaobjectGid": mapping.metaobjectId }] : []),
        ],
      })
        .select({
          _id: 1,
          artistKey: 1,
          publicSlug: 1,
          displayName: 1,
          appUrl: 1,
          instagram: 1,
          quote: 1,
          introduction: 1,
          longText: 1,
          linkedUserId: 1,
          profileImages: 1,
          shopifyMetaobjectId: 1,
          shopify: 1,
          handle: 1,
        })
        .lean()) ||
      null;

    const displayNameFallbackMatches =
      canonicalArtist || !mapping.displayName
        ? []
        : await CanonicalArtistModel.find({
            shopDomain,
            displayName: exactCaseInsensitive(mapping.displayName),
          })
            .select({
              _id: 1,
              artistKey: 1,
              publicSlug: 1,
              displayName: 1,
              shopifyMetaobjectId: 1,
              shopify: 1,
              handle: 1,
            })
            .limit(10)
            .lean();

    logShopifyDiagnostics(
      "canonical_artist_current_state",
      {
        ...canonicalArtistPayload(canonicalArtist),
        displayNameFallbackMatchCount: displayNameFallbackMatches.length,
        displayNameFallbackMatches: fallbackDisplayNamePayload(displayNameFallbackMatches),
      },
      { runId, force: true },
    );

    let appliedArtist: any = null;
    let updatedFields: string[] = [];

    if (apply) {
      const updatePayload = {
        displayName: mapping.displayName,
        appUrl: mapping.appUrl || undefined,
        instagram: mapping.instagram || undefined,
        quote: mapping.quote || undefined,
        introduction: mapping.introduction || undefined,
        bio: mapping.bio || undefined,
        longText: mapping.longText || undefined,
        categoryRef: mapping.categoryRef || undefined,
        shopifyMetaobjectId: mapping.metaobjectId || undefined,
        profileImages: mapping.profileImages,
        "shopify.metaobjectGid": mapping.metaobjectId || undefined,
        "shopify.lastPulledAt": new Date(),
      };

      updatedFields = Object.keys(updatePayload);
      if (canonicalArtist?._id) {
        appliedArtist = await CanonicalArtistModel.findByIdAndUpdate(
          canonicalArtist._id,
          {
            $set: updatePayload,
          },
          { new: true },
        ).lean();
      } else {
        appliedArtist = await CanonicalArtistModel.findOneAndUpdate(
          {
            shopDomain,
            shopifyMetaobjectId: mapping.metaobjectId,
          },
          {
            $set: updatePayload,
            $setOnInsert: {
              shopDomain,
              artistKey: mapping.handle,
              handle: mapping.handle,
              publicSlug: mapping.handle,
              migrationStatus: "imported_unlinked",
              linkStatus: "imported_unlinked",
            },
          },
          { upsert: true, new: true },
        ).lean();
      }

      logShopifyDiagnostics(
        "canonical_artist_diagnostics_apply_done",
        {
          canonicalArtistId: appliedArtist ? String(appliedArtist._id) : null,
          updatedFields,
          hasCoverImage: Boolean(appliedArtist?.profileImages?.heroUrl),
          galleryImageCount: Array.isArray(appliedArtist?.profileImages?.galleryUrls) ? appliedArtist.profileImages.galleryUrls.length : 0,
          hasIntro: Boolean(appliedArtist?.introduction),
          hasLongText: Boolean(appliedArtist?.longText),
        },
        { runId, force: true },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        runId,
        source,
        metaobject: {
          metaobjectId: mapping.metaobjectId,
          handle: mapping.handle,
          type: mapping.type,
          displayName: mapping.displayName,
          rawFields: mapping.rawFieldSummary,
        },
        mapping: {
          appUrl: mapping.appUrl || null,
          coverImageUrl: mapping.coverImageUrl || null,
          galleryImages: mapping.galleryImages,
          instagram: mapping.instagram || null,
          quote: mapping.quote || null,
          intro: mapping.introduction || null,
          longText: mapping.longText || null,
          categoryRef: mapping.categoryRef || null,
          fieldChecks: mapping.fieldMappings,
        },
        canonicalArtist: canonicalArtistPayload(appliedArtist || canonicalArtist),
        canonicalArtistLookup: {
          displayNameFallbackMatchCount: displayNameFallbackMatches.length,
          displayNameFallbackMatches: fallbackDisplayNamePayload(displayNameFallbackMatches),
        },
        applied: apply,
      },
      { status: 200 },
    );
  } catch (error) {
    logSyncError(
      "artist_diagnostics_failed",
      error,
      {
        slug,
        shopDomain,
        apply,
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: "artist_diagnostics_failed", runId }, { status: 500 });
  }
}
