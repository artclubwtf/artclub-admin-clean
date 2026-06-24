import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import {
  generateAspectRatioPrintSizes,
} from "@/lib/server/artist-print-pricing";
import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { resolvePublicArtistMediaUrls } from "@/lib/server/artist-media";
import { buildPrintVariants, buildArtworkSku, dedupeTrimmed, normalizeSelectedPrintSizeCodes } from "@/lib/server/artwork-variants";
import { ensureCanonicalProductIndexes } from "@/lib/server/canonical-product-indexes";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";
import { artistProductOwnershipFilter } from "@/lib/server/product-ownership";
import { autoPushProductToShopify } from "@/lib/server/shopify-auto-sync";
import { createSyncRunId, logAutoSync, logSyncError } from "../../../../../admin/lib/sync/syncLogger";

const createArtworkSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().max(4000).optional().default(""),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    originalWidthCm: z.number().positive().max(1000).nullable().optional(),
    originalHeightCm: z.number().positive().max(1000).nullable().optional(),
    originalPriceEur: z.number().positive().max(100000).nullable().optional(),
    seriesId: z.string().trim().optional().or(z.literal("")),
    mediaIds: z.array(z.string().trim().min(1)).min(1),
    forSale: z.boolean(),
    originalAvailable: z.boolean(),
    printsEnabled: z.boolean(),
    printSizeCodes: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

function makeProductKey() {
  return `prod_${new Types.ObjectId().toString()}`;
}

export async function GET() {
  try {
    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;

    const products = await CanonicalProductModel.find({
      ...artistProductOwnershipFilter(context),
      type: "artwork",
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const productKeys = dedupeTrimmed(products.map((item) => item.productKey || ""));
    const variants = productKeys.length
      ? await CanonicalVariantModel.find({
          shopDomain: context.user.shopDomain,
          productKey: { $in: productKeys },
        }).lean()
      : [];

    const variantsByProduct = variants.reduce<Record<string, typeof variants>>((acc, item) => {
      const key = item.productKey.trim();
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    return NextResponse.json(
      {
        ok: true,
        artworks: products.map((product) => ({
          id: product._id.toString(),
          productKey: product.productKey,
          title: product.title,
          description: product.description || "",
          year: product.year ?? null,
          status: product.status,
          forSale: product.forSale !== false,
          originalAvailable: product.originalAvailable === true,
          printsEnabled: product.allowPrints === true,
          syncState: product.sync?.needsPush ? "changes_pending" : product.status === "db_only" ? "draft_only" : "synced",
          seriesId: product.seriesId || "",
          seriesName: product.seriesName || "",
          images: {
            thumbUrl: product.images?.thumbUrl || "",
            mediumUrl: product.images?.mediumUrl || "",
            originalUrl: product.images?.originalUrl || "",
            galleryUrls: Array.isArray(product.images?.galleryUrls) ? product.images.galleryUrls : [],
          },
          variants: (variantsByProduct[product.productKey] || []).map((variant) => ({
            id: variant._id.toString(),
            variantKey: variant.variantKey,
            finish: variant.finish,
            sizeCode: variant.sizeCode,
            sku: variant.sku,
            priceCents: variant.priceCents,
          })),
          updatedAt: product.updatedAt,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    return artistApiErrorResponse(error, "artworks_load_failed");
  }
}

export async function POST(req: Request) {
  try {
    await ensureCanonicalProductIndexes();

    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;

    const payload = (await req.json().catch(() => null)) as unknown;
    const parsed = createArtworkSchema.safeParse(payload || {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const data = parsed.data;
    const originalWidthCm = data.originalWidthCm ?? null;
    const originalHeightCm = data.originalHeightCm ?? null;
    const originalPriceCents = Number.isFinite(data.originalPriceEur) ? Math.round((data.originalPriceEur ?? 0) * 100) : null;
    const generatedPrintSizes = generateAspectRatioPrintSizes({ originalWidthCm, originalHeightCm });
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
    if (data.printsEnabled && printSizeCodes.length !== dedupeTrimmed(data.printSizeCodes).map((code) => code.toUpperCase()).length) {
      return NextResponse.json({ ok: false, error: "invalid_print_size_selection" }, { status: 400 });
    }

    const mediaObjectIds = data.mediaIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (mediaObjectIds.length !== data.mediaIds.length) {
      return NextResponse.json({ ok: false, error: "invalid_media_ids" }, { status: 400 });
    }

    const media = await ArtistMediaV2Model.find({
      _id: { $in: mediaObjectIds },
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
    })
      .sort({ createdAt: 1 })
      .lean();
    if (media.length !== mediaObjectIds.length) {
      return NextResponse.json({ ok: false, error: "media_not_found" }, { status: 404 });
    }

    const productKey = makeProductKey();
    let seriesId: string | undefined;
    let seriesName: string | undefined;
    if (data.seriesId) {
      if (!Types.ObjectId.isValid(data.seriesId)) {
        return NextResponse.json({ ok: false, error: "invalid_series_id" }, { status: 400 });
      }
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
    const primaryUrls = resolvePublicArtistMediaUrls(primaryImage);
    const galleryUrls = dedupeTrimmed(media.map((item) => resolvePublicArtistMediaUrls(item).previewUrl).filter(Boolean));

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
        productKey,
        variantKey: "original",
        finish: "original",
        sizeCode: "ORIGINAL",
        sku: buildArtworkSku(context.user.artistKey, productKey, "ORIGINAL"),
        priceCents: originalPriceCents && originalPriceCents > 0 ? originalPriceCents : 0,
        inventory: { tracked: true },
      });
    }

    if (data.printsEnabled) {
      variantsToInsert.push(
        ...buildPrintVariants({
          shopDomain: context.user.shopDomain,
          artistKey: context.user.artistKey,
          productKey,
          selectedSizeCodes: printSizeCodes,
          originalWidthCm: originalWidthCm!,
          originalHeightCm: originalHeightCm!,
        }),
      );
    }

    if (!variantsToInsert.length) {
      return NextResponse.json({ ok: false, error: "no_variants_generated" }, { status: 400 });
    }

    const offerings =
      data.originalAvailable && data.printsEnabled
        ? "original_plus_prints"
        : data.printsEnabled
          ? "prints_only"
          : "original_only";
    const saleable = data.forSale === true || data.printsEnabled === true;
    const autoSyncRunId = createSyncRunId("artist-auto-sync");

    logAutoSync(
      "artist_app_artwork_create_requested",
      {
        userId: context.sessionUserId,
        canonicalArtistId: String(context.canonicalArtist._id),
        artistKey: context.user.artistKey,
        title: data.title,
        forSale: data.forSale,
        allowPrints: data.printsEnabled,
        printsEnabled: data.printsEnabled,
        originalAvailable: data.originalAvailable,
        imageCount: galleryUrls.length,
        hasDimensions: Boolean(originalWidthCm && originalHeightCm),
        widthCm: originalWidthCm,
        heightCm: originalHeightCm,
        variantPlanCount: variantsToInsert.length,
      },
      { runId: autoSyncRunId, force: true },
    );

    const createdProduct = await CanonicalProductModel.create({
      shopDomain: context.user.shopDomain,
      productKey,
      type: "artwork",
      title: data.title,
      description: data.description || undefined,
      canonicalArtistId: context.canonicalArtist._id,
      artistKey: context.user.artistKey,
      artistRef: context.canonicalArtist.shopify?.metaobjectGid || undefined,
      seriesId,
      seriesName,
      offerings,
      forSale: data.forSale,
      allowPrints: data.printsEnabled,
      originalAvailable: data.originalAvailable,
      status: saleable ? "shopify_pending" : "draft",
      approvalStatus: saleable ? "approved" : "unassigned",
      year: data.year ?? undefined,
      images: {
        thumbUrl: primaryUrls.previewUrl,
        mediumUrl: primaryUrls.previewUrl,
        originalUrl: primaryUrls.url,
        galleryUrls,
        altText: data.title,
        source: "artist_media_v2",
        artistMediaIds: media.map((item) => item._id.toString()),
      },
      dimensions: {
        widthCm: originalWidthCm ?? undefined,
        heightCm: originalHeightCm ?? undefined,
      },
      sync: {
        status: saleable ? "pending" : "draft",
        needsPush: saleable,
        dirtyAt: saleable ? new Date() : null,
        dirtyFields: saleable
          ? ["title", "description", "offerings", "forSale", "allowPrints", "originalAvailable", "images", "dimensions"]
          : [],
      },
    });

    logAutoSync(
      "artist_app_artwork_created",
      {
        canonicalProductId: String(createdProduct._id),
        productKey,
        status: createdProduct.status,
        syncNeedsPush: createdProduct.sync?.needsPush === true,
        canonicalArtistId: String(context.canonicalArtist._id),
      },
      { runId: autoSyncRunId, force: true },
    );

    try {
      await CanonicalVariantModel.insertMany(variantsToInsert, { ordered: true });
    } catch (error) {
      await CanonicalProductModel.deleteOne({
        shopDomain: context.user.shopDomain,
        productKey,
      }).catch(() => null);
      throw error;
    }

    logAutoSync(
      "artist_app_auto_shopify_push_started",
      {
        canonicalProductId: String(createdProduct._id),
        title: data.title,
        canonicalArtistId: String(context.canonicalArtist._id),
        reason: "artwork_created",
        isSaleable: saleable,
        existingShopifyProductId: null,
        existingProductGid: null,
      },
      { runId: autoSyncRunId, force: true },
    );

    const sync = await autoPushProductToShopify({
      shopDomain: context.user.shopDomain,
      productKey,
      shouldPush: saleable,
      runId: autoSyncRunId,
      reason: "artwork_created",
    });

    if (sync.ok) {
      logAutoSync(
        "artist_app_auto_shopify_push_succeeded",
        {
          canonicalProductId: String(createdProduct._id),
          shopifyProductId: sync.shopifyProductId || null,
          productGid: sync.productGid || null,
          variantCount: sync.variantCount ?? variantsToInsert.length,
          syncStatus: sync.status || sync.syncStatus || null,
          lastPushAt: sync.lastPushAt || null,
        },
        { runId: autoSyncRunId, force: true },
      );
    } else {
      logSyncError(
        "artist_app_auto_shopify_push_failed",
        sync.error,
        {
          canonicalProductId: String(createdProduct._id),
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
        productKey,
        artwork: {
          id: createdProduct._id.toString(),
          productKey,
        },
        sync,
      },
      { status: 201 },
    );
  } catch (error) {
    return artistApiErrorResponse(error, "artwork_create_failed");
  }
}
