import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import {
  generateAspectRatioPrintSizes,
} from "@/lib/server/artist-print-pricing";
import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { buildProductSyncPatch } from "@/lib/server/artist-sync";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { parseArtistMediaIdFromUrl, resolvePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { buildPrintVariants, buildArtworkSku, dedupeTrimmed, normalizeSelectedPrintSizeCodes } from "@/lib/server/artwork-variants";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";
import { artistProductWriteOwnershipFilter } from "@/lib/server/product-ownership";
import { autoPushProductToShopify } from "@/lib/server/shopify-auto-sync";
import { createSyncRunId, logAutoSync, logSyncError } from "../../../../../../admin/lib/sync/syncLogger";

const patchSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().max(4000).optional().default(""),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    originalWidthCm: z.number().positive().max(1000).nullable().optional(),
    originalHeightCm: z.number().positive().max(1000).nullable().optional(),
    originalPriceEur: z.number().positive().max(100000).nullable().optional(),
    seriesId: z.string().trim().optional().or(z.literal("")),
    mediaIds: z.array(z.string().trim().min(1)).default([]),
    forSale: z.boolean(),
    originalAvailable: z.boolean(),
    printsEnabled: z.boolean(),
    printSizeCodes: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;
    const { id } = await params;

    const artwork = await CanonicalProductModel.findOne({
      ...artistProductWriteOwnershipFilter(context),
      productKey: id,
      type: "artwork",
    }).lean();

    if (!artwork) {
      return NextResponse.json({ ok: false, error: "artwork_not_found" }, { status: 404 });
    }

    const variants = await CanonicalVariantModel.find({
      shopDomain: context.user.shopDomain,
      productKey: artwork.productKey,
    }).lean();
    const originalVariant = variants.find((variant) => variant.finish === "original");

    const galleryUrls = Array.isArray(artwork.images?.galleryUrls) ? artwork.images.galleryUrls : [];
    const galleryMediaIds = galleryUrls.map((url) => parseArtistMediaIdFromUrl(url)).filter(Boolean) as string[];
    const media = galleryUrls.length
      ? await ArtistMediaV2Model.find({
          shopDomain: context.user.shopDomain,
          artistKey: context.user.artistKey,
          $or: [
            ...(galleryMediaIds.length ? [{ _id: { $in: galleryMediaIds } }] : []),
            { url: { $in: galleryUrls } },
            { previewUrl: { $in: galleryUrls } },
          ],
        }).lean()
      : [];

    return NextResponse.json(
      {
        ok: true,
        printSizes: generateAspectRatioPrintSizes({
          originalWidthCm: artwork.dimensions?.widthCm ?? null,
          originalHeightCm: artwork.dimensions?.heightCm ?? null,
        }),
        artwork: {
          id: artwork._id.toString(),
          productKey: artwork.productKey,
          title: artwork.title,
          description: artwork.description || "",
          year: artwork.year ?? null,
          originalWidthCm: artwork.dimensions?.widthCm ?? null,
          originalHeightCm: artwork.dimensions?.heightCm ?? null,
          originalPriceCents: originalVariant?.priceCents ?? null,
          forSale: artwork.forSale !== false,
          originalAvailable: artwork.originalAvailable === true,
          printsEnabled: artwork.allowPrints === true,
          seriesId: artwork.seriesId || "",
          seriesName: artwork.seriesName || "",
          status: artwork.status,
          images: {
            thumbUrl: artwork.images?.thumbUrl || "",
            mediumUrl: artwork.images?.mediumUrl || "",
            originalUrl: artwork.images?.originalUrl || "",
            galleryUrls: Array.isArray(artwork.images?.galleryUrls) ? artwork.images.galleryUrls : [],
          },
          mediaIds: media.map((item) => item._id.toString()),
          printSizeCodes: Array.from(new Set(variants.filter((variant) => variant.finish !== "original").map((variant) => variant.sizeCode))),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return artistApiErrorResponse(error, "artwork_load_failed");
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;
    const { id } = await params;

    const artwork = await CanonicalProductModel.findOne({
      ...artistProductWriteOwnershipFilter(context),
      productKey: id,
      type: "artwork",
    }).lean();
    if (!artwork) {
      return NextResponse.json({ ok: false, error: "artwork_not_found" }, { status: 404 });
    }

    const autoSyncRunId = createSyncRunId("artist-auto-sync");

    const payload = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(payload || {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const data = parsed.data;
    const originalWidthCm = data.originalWidthCm ?? null;
    const originalHeightCm = data.originalHeightCm ?? null;
    const originalPriceCents = Number.isFinite(data.originalPriceEur) ? Math.round((data.originalPriceEur ?? 0) * 100) : null;
    const generatedPrintSizes = generateAspectRatioPrintSizes({ originalWidthCm, originalHeightCm });
    const submittedSizeCodes = dedupeTrimmed(data.printSizeCodes).map((code) => code.toUpperCase());
    const printSizeCodes = normalizeSelectedPrintSizeCodes(data.printSizeCodes, { originalWidthCm, originalHeightCm });

    if (data.originalAvailable && data.forSale && !data.originalPriceEur) {
      return NextResponse.json({ ok: false, error: "original_price_required" }, { status: 400 });
    }
    if (data.originalAvailable && data.forSale && (!originalPriceCents || originalPriceCents <= 0)) {
      return NextResponse.json({ ok: false, error: "invalid_original_price" }, { status: 400 });
    }
    if (data.printsEnabled && (!originalWidthCm || !originalHeightCm)) {
      return NextResponse.json({ ok: false, error: "original_dimensions_required" }, { status: 400 });
    }
    if (data.printsEnabled && generatedPrintSizes.length === 0) {
      return NextResponse.json({ ok: false, error: "invalid_print_configuration" }, { status: 400 });
    }
    if (data.printsEnabled && printSizeCodes.length === 0) {
      return NextResponse.json({ ok: false, error: "print_sizes_required" }, { status: 400 });
    }
    if (data.printsEnabled && printSizeCodes.length !== submittedSizeCodes.length) {
      return NextResponse.json({ ok: false, error: "invalid_print_size_selection" }, { status: 400 });
    }

    const mediaObjectIds = data.mediaIds.filter((mediaId) => Types.ObjectId.isValid(mediaId)).map((mediaId) => new Types.ObjectId(mediaId));
    if (mediaObjectIds.length !== data.mediaIds.length) {
      return NextResponse.json({ ok: false, error: "invalid_media_ids" }, { status: 400 });
    }

    const media = mediaObjectIds.length
      ? await ArtistMediaV2Model.find({
          _id: { $in: mediaObjectIds },
          shopDomain: context.user.shopDomain,
          artistKey: context.user.artistKey,
        })
          .sort({ createdAt: 1 })
          .lean()
      : [];
    if (media.length !== mediaObjectIds.length) {
      return NextResponse.json({ ok: false, error: "media_not_found" }, { status: 404 });
    }

    let seriesId: string | undefined;
    let seriesName: string | undefined;
    if (data.seriesId) {
      const series = await ArtistSeriesModel.findOne({
        _id: data.seriesId,
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
      })
        .select({ _id: 1, name: 1 })
        .lean();
      if (!series) {
        return NextResponse.json({ ok: false, error: "series_not_found" }, { status: 404 });
      }
      seriesId = series._id.toString();
      seriesName = series.name;
    }

    const primaryImage = media[0];
    const primaryUrls = media.length ? resolvePublicArtistMediaUrls(primaryImage) : null;
    const galleryUrls = media.length
      ? dedupeTrimmed(media.map((item) => resolvePublicArtistMediaUrls(item).previewUrl).filter(Boolean))
      : Array.isArray(artwork.images?.galleryUrls)
        ? artwork.images.galleryUrls
        : [];
    const offerings =
      data.originalAvailable && data.printsEnabled
        ? "original_plus_prints"
        : data.printsEnabled
          ? "prints_only"
          : "original_only";
    const saleable = data.forSale === true || data.printsEnabled === true;
    const changedFields = [
      artwork.title !== data.title ? "title" : null,
      (artwork.description || "") !== (data.description || "") ? "description" : null,
      artwork.forSale !== data.forSale ? "forSale" : null,
      artwork.allowPrints !== data.printsEnabled ? "allowPrints" : null,
      artwork.originalAvailable !== data.originalAvailable ? "originalAvailable" : null,
      artwork.seriesId !== seriesId ? "seriesId" : null,
      artwork.seriesName !== seriesName ? "seriesName" : null,
      artwork.year !== (data.year ?? undefined) ? "year" : null,
      (artwork.dimensions?.widthCm ?? null) !== originalWidthCm ? "dimensions.widthCm" : null,
      (artwork.dimensions?.heightCm ?? null) !== originalHeightCm ? "dimensions.heightCm" : null,
      JSON.stringify(Array.isArray(artwork.images?.galleryUrls) ? artwork.images.galleryUrls : []) !== JSON.stringify(galleryUrls)
        ? "images.galleryUrls"
        : null,
    ].filter(Boolean) as string[];
    const shopifyRelevantChanges = changedFields.length > 0 || saleable !== (artwork.forSale === true || artwork.allowPrints === true);

    logAutoSync(
      "artist_app_artwork_update_requested",
      {
        canonicalProductId: String(artwork._id),
        productKey: artwork.productKey,
        title: data.title,
        changedFields,
        shopifyRelevantChanges,
        ownershipCheckResult: "passed",
      },
      { runId: autoSyncRunId, force: true },
    );

    const syncDirtyFields: string[] = [
      "title",
      "description",
      "offerings",
      "forSale",
      "allowPrints",
      "originalAvailable",
      "seriesId",
      "seriesName",
      "images",
      "dimensions",
    ];

    const syncPatch = buildProductSyncPatch({
      currentDirtyFields: artwork.sync?.dirtyFields,
      changedFields: syncDirtyFields,
      status: artwork.status,
      hasShopifyProduct: Boolean(artwork.shopify?.productGid),
    });
    const nextStatus =
      artwork.status === "archived"
        ? "archived"
        : saleable
          ? "shopify_pending"
          : "draft";
    const nextApprovalStatus =
      artwork.status === "archived"
        ? "archived"
        : saleable
          ? artwork.approvalStatus === "published"
            ? "published"
            : "approved"
          : "unassigned";

    await CanonicalProductModel.updateOne(
      {
        ...artistProductWriteOwnershipFilter(context),
        productKey: id,
        type: "artwork",
      },
      {
        $set: {
          title: data.title,
          description: data.description || undefined,
          canonicalArtistId: context.canonicalArtist._id,
          artistKey: context.canonicalArtist.artistKey,
          status: nextStatus,
          approvalStatus: nextApprovalStatus,
          offerings,
          forSale: data.forSale,
          allowPrints: data.printsEnabled,
          originalAvailable: data.originalAvailable,
          seriesId,
          seriesName,
          year: data.year ?? undefined,
          images: media.length
            ? {
                thumbUrl: primaryUrls?.previewUrl || "",
                mediumUrl: primaryUrls?.previewUrl || "",
                originalUrl: primaryUrls?.url || "",
                galleryUrls,
              }
            : artwork.images,
          dimensions: {
            widthCm: originalWidthCm ?? undefined,
            heightCm: originalHeightCm ?? undefined,
          },
          "sync.status": saleable ? "pending" : "draft",
          ...syncPatch,
        },
      },
    );

    await CanonicalVariantModel.deleteMany({
      shopDomain: context.user.shopDomain,
      productKey: id,
    });

    const variantsToInsert: Array<{
      shopDomain: string;
      productKey: string;
      variantKey: string;
      finish: string;
      sizeCode: string;
      sku: string;
      priceCents: number;
      inventory: { tracked: boolean };
    }> = [];

    if (data.originalAvailable) {
      variantsToInsert.push({
        shopDomain: context.user.shopDomain,
        productKey: id,
        variantKey: "original",
        finish: "original",
        sizeCode: "ORIGINAL",
        sku: buildArtworkSku(context.user.artistKey, id, "ORIGINAL"),
        priceCents: originalPriceCents && originalPriceCents > 0 ? originalPriceCents : 0,
        inventory: { tracked: true },
      });
    }

    if (data.printsEnabled) {
      variantsToInsert.push(
        ...buildPrintVariants({
          shopDomain: context.user.shopDomain,
          artistKey: context.user.artistKey,
          productKey: id,
          selectedSizeCodes: printSizeCodes,
          originalWidthCm: originalWidthCm!,
          originalHeightCm: originalHeightCm!,
        }),
      );
    }

    if (variantsToInsert.length) {
      await CanonicalVariantModel.insertMany(variantsToInsert, { ordered: true });
    }

    logAutoSync(
      "artist_app_auto_shopify_push_started",
      {
        canonicalProductId: String(artwork._id),
        title: data.title,
        canonicalArtistId: String(context.canonicalArtist._id),
        reason: "artwork_updated",
        isSaleable: saleable && nextStatus !== "archived",
        existingShopifyProductId: artwork.shopifyProductId || null,
        existingProductGid: artwork.shopify?.productGid || artwork.shopifyProductId || null,
      },
      { runId: autoSyncRunId, force: true },
    );

    const sync = await autoPushProductToShopify({
      shopDomain: context.user.shopDomain,
      productKey: id,
      shouldPush: saleable && nextStatus !== "archived",
      runId: autoSyncRunId,
      reason: "artwork_updated",
    });

    if (sync.ok && !sync.queued) {
      logAutoSync(
        "artist_app_auto_shopify_push_succeeded",
        {
          canonicalProductId: String(artwork._id),
          shopifyProductId: sync.shopifyProductId || artwork.shopifyProductId || null,
          productGid: sync.productGid || artwork.shopify?.productGid || artwork.shopifyProductId || null,
          variantCount: sync.variantCount ?? variantsToInsert.length,
          syncStatus: sync.status || sync.syncStatus || null,
          lastPushAt: sync.lastPushAt || null,
        },
        { runId: autoSyncRunId, force: true },
      );
    } else if (!sync.ok) {
      logSyncError(
        "artist_app_auto_shopify_push_failed",
        sync.error,
        {
          canonicalProductId: String(artwork._id),
          title: data.title,
          canonicalArtistId: String(context.canonicalArtist._id),
          errorMessage: sync.error,
          graphqlErrors: null,
          userErrors: null,
        },
        { runId: autoSyncRunId, force: true },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        artwork: {
          id: String(artwork._id),
          productKey: id,
        },
        sync,
      },
      { status: 200 },
    );
  } catch (error) {
    return artistApiErrorResponse(error, "artwork_update_failed");
  }
}
