import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import {
  ARTIST_PRINT_SIZES,
  calculatePrintPriceCents,
  getArtistPrintSizeByCode,
} from "@/lib/server/artist-print-pricing";
import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { buildProductSyncPatch } from "@/lib/server/artist-sync";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";

const patchSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().max(4000).optional().default(""),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    widthCm: z.number().positive().max(1000).nullable().optional(),
    heightCm: z.number().positive().max(1000).nullable().optional(),
    seriesId: z.string().trim().optional().or(z.literal("")),
    mediaIds: z.array(z.string().trim().min(1)).default([]),
    forSale: z.boolean(),
    originalAvailable: z.boolean(),
    printsEnabled: z.boolean(),
    printSizeCodes: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

function dedupeTrimmed(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatSkuPiece(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function buildSku(artistKey: string, productKey: string, sizeCode: string) {
  const artistPart = formatSkuPiece(artistKey).slice(-6) || "ARTIST";
  const productPart = formatSkuPiece(productKey).slice(-6) || "PRD";
  const sizePart = formatSkuPiece(sizeCode).slice(0, 10) || "SIZE";
  return `${artistPart}-${productPart}-${sizePart}`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;
    const { id } = await params;

    const artwork = await CanonicalProductModel.findOne({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
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

    const media = Array.isArray(artwork.images?.galleryUrls) && artwork.images.galleryUrls.length
      ? await ArtistMediaV2Model.find({
          shopDomain: context.user.shopDomain,
          artistKey: context.user.artistKey,
          $or: [{ url: { $in: artwork.images.galleryUrls } }, { previewUrl: { $in: artwork.images.galleryUrls } }],
        }).lean()
      : [];

    return NextResponse.json(
      {
        ok: true,
        printSizes: ARTIST_PRINT_SIZES,
        artwork: {
          id: artwork._id.toString(),
          productKey: artwork.productKey,
          title: artwork.title,
          description: artwork.description || "",
          year: artwork.year ?? null,
          widthCm: artwork.dimensions?.widthCm ?? null,
          heightCm: artwork.dimensions?.heightCm ?? null,
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
          printSizeCodes: variants.filter((variant) => variant.finish === "print").map((variant) => variant.sizeCode),
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
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
      productKey: id,
      type: "artwork",
    }).lean();
    if (!artwork) {
      return NextResponse.json({ ok: false, error: "artwork_not_found" }, { status: 404 });
    }

    const payload = (await req.json().catch(() => null)) as unknown;
    const parsed = patchSchema.safeParse(payload || {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
    }

    const data = parsed.data;
    const printSizeCodes = dedupeTrimmed(data.printSizeCodes).map((code) => code.toUpperCase());
    if (data.printsEnabled && printSizeCodes.length === 0) {
      return NextResponse.json({ ok: false, error: "print_sizes_required" }, { status: 400 });
    }
    const unknownSize = printSizeCodes.find((code) => !getArtistPrintSizeByCode(code));
    if (unknownSize) {
      return NextResponse.json({ ok: false, error: "invalid_print_size", sizeCode: unknownSize }, { status: 400 });
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
    const galleryUrls = media.length
      ? dedupeTrimmed(media.map((item) => item.previewUrl || item.url || "").filter(Boolean))
      : Array.isArray(artwork.images?.galleryUrls)
        ? artwork.images.galleryUrls
        : [];
    const offerings =
      data.originalAvailable && data.printsEnabled
        ? "original_plus_prints"
        : data.printsEnabled
          ? "prints_only"
          : "original_only";

    const changedFields: string[] = [
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
      changedFields,
      status: artwork.status,
      hasShopifyProduct: Boolean(artwork.shopify?.productGid),
    });

    await CanonicalProductModel.updateOne(
      {
        shopDomain: context.user.shopDomain,
        artistKey: context.user.artistKey,
        productKey: id,
        type: "artwork",
      },
      {
        $set: {
          title: data.title,
          description: data.description || undefined,
          offerings,
          forSale: data.forSale,
          allowPrints: data.printsEnabled,
          originalAvailable: data.originalAvailable,
          seriesId,
          seriesName,
          year: data.year ?? undefined,
          images: media.length
            ? {
                thumbUrl: primaryImage.previewUrl || primaryImage.url,
                mediumUrl: primaryImage.previewUrl || primaryImage.url,
                originalUrl: primaryImage.url,
                galleryUrls,
              }
            : artwork.images,
          dimensions: {
            widthCm: data.widthCm ?? undefined,
            heightCm: data.heightCm ?? undefined,
          },
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
        sku: buildSku(context.user.artistKey, id, "ORIGINAL"),
        priceCents: 0,
        inventory: { tracked: true },
      });
    }

    if (data.printsEnabled) {
      for (const sizeCode of printSizeCodes) {
        const size = getArtistPrintSizeByCode(sizeCode);
        if (!size) continue;
        variantsToInsert.push({
          shopDomain: context.user.shopDomain,
          productKey: id,
          variantKey: `print_${size.code.toLowerCase()}`,
          finish: "print",
          sizeCode: size.code,
          sku: buildSku(context.user.artistKey, id, size.code),
          priceCents: calculatePrintPriceCents({ widthCm: size.widthCm, heightCm: size.heightCm }),
          inventory: { tracked: false },
        });
      }
    }

    if (variantsToInsert.length) {
      await CanonicalVariantModel.insertMany(variantsToInsert, { ordered: true });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return artistApiErrorResponse(error, "artwork_update_failed");
  }
}
