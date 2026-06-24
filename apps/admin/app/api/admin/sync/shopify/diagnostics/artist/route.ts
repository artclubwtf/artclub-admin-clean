import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { isShopifyWriteEnabled } from "@/lib/featureFlags";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  extractShopifyArtistMetaobjectMapping,
  matchesArtistSlug,
  resolveShopifyFileField,
  type ShopifyArtistMetaobjectNode,
} from "@/lib/sync/shopifyMapping";
import {
  collectShopifyReferenceGids,
  hydrateArtistMetaobjectWithResolvedReferences,
  resolveShopifyReferenceNodes,
} from "@/lib/sync/shopifyReferenceLookup";
import { createSyncRunId, logShopifyDiagnostics, logSyncError } from "@/lib/sync/syncLogger";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { ShopifySyncJobModel } from "@/models/ShopifySyncJob";

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
    syncStatus: artist?.sync?.status || null,
    lastError: artist?.sync?.lastError || null,
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
  const canonicalArtistId = (url.searchParams.get("canonicalArtistId") || "").trim();
  const apply = url.searchParams.get("apply") === "true";
  if (!slug && !canonicalArtistId) {
    return NextResponse.json({ ok: false, error: "missing_slug_or_canonical_artist_id" }, { status: 400 });
  }
  if (canonicalArtistId && !Types.ObjectId.isValid(canonicalArtistId)) {
    return NextResponse.json({ ok: false, error: "invalid_canonical_artist_id" }, { status: 400 });
  }

  const runId = createSyncRunId("shopify-diagnostics-artist");
  const shopDomain = resolveShopDomain();
  logShopifyDiagnostics(
    "artist_diagnostics_started",
    {
      runId,
      service: "admin",
      slug,
      canonicalArtistId: canonicalArtistId || null,
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

    const requestedArtist = canonicalArtistId
      ? await CanonicalArtistModel.findById(canonicalArtistId)
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
            sync: 1,
          })
          .lean()
      : null;
    if (canonicalArtistId && !requestedArtist && !slug) {
      return NextResponse.json({ ok: false, error: "artist_not_found", runId }, { status: 404 });
    }
    const effectiveSlug = slug || requestedArtist?.publicSlug || requestedArtist?.handle || requestedArtist?.artistKey || "";
    const lookupResult: { metaobject: ShopifyArtistMetaobjectNode | null; source: string | null } = effectiveSlug
      ? await fetchArtistMetaobject(effectiveSlug)
      : { metaobject: null, source: null };
    const { metaobject, source } = lookupResult;
    logShopifyDiagnostics(
      "shopify_artist_metaobject_lookup_result",
      {
        slug: effectiveSlug || null,
        canonicalArtistId: canonicalArtistId || null,
        source,
        metaobjectFound: Boolean(metaobject),
        metaobjectId: metaobject?.id?.trim() || null,
        handle: metaobject?.handle?.trim() || null,
        displayName: metaobject?.displayName?.trim() || null,
      },
      { runId, force: true },
    );

    if (!metaobject && apply) {
      return NextResponse.json({ ok: false, error: "artist_metaobject_not_found", runId, source }, { status: 404 });
    }

    const mapping = metaobject
      ? extractShopifyArtistMetaobjectMapping(
          hydrateArtistMetaobjectWithResolvedReferences(
            metaobject,
            await resolveShopifyReferenceNodes(collectShopifyReferenceGids(metaobject.fields || [])),
          ),
        )
      : null;
    if (mapping && metaobject) {
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

      const referenceLookup = await resolveShopifyReferenceNodes(collectShopifyReferenceGids(metaobject.fields || []));
      const hydratedMetaobject = hydrateArtistMetaobjectWithResolvedReferences(metaobject, referenceLookup);
      for (const field of hydratedMetaobject.fields || []) {
        const fieldKey = field?.key?.trim();
        if (!fieldKey || !["bilder", "bild_1", "bild_2", "bild_3"].includes(fieldKey)) continue;
        const resolved = resolveShopifyFileField(field);
        logShopifyDiagnostics(
          "shopify_file_reference_resolve",
          {
            fieldKey: resolved.fieldKey,
            rawValue: resolved.rawValuePreview,
            hasReference: resolved.hasReference,
            referenceTypename: resolved.referenceTypename,
            mediaGid: resolved.mediaGid || resolved.shopifyFileGid || null,
            imageUrlFound: Boolean(resolved.referenceImageUrl),
            imageUrl: resolved.referenceImageUrl,
            genericFileUrlFound: Boolean(resolved.referenceGenericFileUrl),
            reason: resolved.resolvedUrl ? null : resolved.reason,
          },
          { runId, force: true },
        );
      }

      for (const fieldCheck of mapping.fieldMappings) {
        logShopifyDiagnostics(
          "shopify_artist_field_mapping_check",
          fieldCheck,
          { runId, force: true },
        );
        logShopifyDiagnostics(
          "artist_metaobject_field_mapping_result",
          fieldCheck,
          { runId, force: true },
        );
      }
    }

    const exact = effectiveSlug ? exactCaseInsensitive(effectiveSlug) : null;
    let canonicalArtist = requestedArtist;
    if (!canonicalArtist && exact) {
      canonicalArtist =
        (await CanonicalArtistModel.findOne({
          shopDomain,
          $or: [
            { publicSlug: exact },
            { handle: exact },
            { artistKey: exact },
            ...(mapping?.metaobjectId
              ? [{ shopifyMetaobjectId: mapping.metaobjectId }, { "shopify.metaobjectGid": mapping.metaobjectId }]
              : []),
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
            sync: 1,
          })
          .lean()) ||
        null;
    }

    const displayNameFallbackMatches =
      canonicalArtist || !mapping?.displayName
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
              sync: 1,
            })
            .limit(10)
            .lean();
    const latestArtistPushJobs = await ShopifySyncJobModel.find({
      type: "artist_push",
      ...(canonicalArtist?._id
        ? { canonicalArtistId: canonicalArtist._id }
        : exact
          ? { artistKey: exact }
          : { _id: null }),
    })
      .sort({ createdAt: -1 })
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
      if (!mapping) {
        return NextResponse.json({ ok: false, error: "artist_metaobject_not_found", runId, source }, { status: 404 });
      }
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
        requested: {
          canonicalArtistId: canonicalArtistId || null,
          slug: effectiveSlug || null,
        },
        metaobject: mapping
          ? {
              metaobjectId: mapping.metaobjectId,
              handle: mapping.handle,
              type: mapping.type,
              displayName: mapping.displayName,
              rawFields: mapping.rawFieldSummary,
            }
          : null,
        mapping: mapping
          ? {
              appUrl: mapping.appUrl || null,
              coverImageUrl: mapping.coverImageUrl || null,
              galleryImages: mapping.galleryImages,
              instagram: mapping.instagram || null,
              quote: mapping.quote || null,
              intro: mapping.introduction || null,
              longText: mapping.longText || null,
              categoryRef: mapping.categoryRef || null,
              fieldChecks: mapping.fieldMappings,
            }
          : null,
        canonicalArtist: canonicalArtistPayload(appliedArtist || canonicalArtist),
        canonicalArtistLookup: {
          displayNameFallbackMatchCount: displayNameFallbackMatches.length,
          displayNameFallbackMatches: fallbackDisplayNamePayload(displayNameFallbackMatches),
        },
        latestArtistPushJobs: latestArtistPushJobs.map((job) => ({
          id: String(job._id),
          type: job.type,
          status: job.status,
          canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : null,
          artistKey: job.artistKey || null,
          attempts: job.attempts || 0,
          nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : null,
          lockedAt: job.lockedAt ? new Date(job.lockedAt).toISOString() : null,
          lastError: job.lastError || null,
          createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
          updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
        })),
        applied: apply,
      },
      { status: 200 },
    );
  } catch (error) {
    logSyncError(
      "artist_diagnostics_failed",
      error,
      {
        slug: slug || null,
        canonicalArtistId: canonicalArtistId || null,
        shopDomain,
        apply,
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: "artist_diagnostics_failed", runId }, { status: 500 });
  }
}
