import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import {
  ARTIST_PRINT_SIZES,
  calculatePrintPriceCents,
  getArtistPrintSizeByCode,
} from "@/lib/server/artist-print-pricing";
import { artistApiErrorResponse } from "@/lib/server/api-errors";
import { requireArtistApiContext } from "@/lib/server/artist-context";
import { resolveArtistMediaUrls } from "@/lib/server/artist-media";
import { ensureCanonicalProductIndexes } from "@/lib/server/canonical-product-indexes";
import { ArtistMediaV2Model, ArtistSeriesModel, CanonicalProductModel, CanonicalVariantModel } from "@/lib/server/models";

const createArtworkSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().max(4000).optional().default(""),
    year: z.number().int().min(1000).max(9999).nullable().optional(),
    widthCm: z.number().positive().max(1000).nullable().optional(),
    heightCm: z.number().positive().max(1000).nullable().optional(),
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

function formatSkuPiece(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function buildSku(artistKey: string, productKey: string, sizeCode: string) {
  const artistPart = formatSkuPiece(artistKey).slice(-6) || "ARTIST";
  const productPart = formatSkuPiece(productKey).slice(-6) || "PRD";
  const sizePart = formatSkuPiece(sizeCode).slice(0, 10) || "SIZE";
  return `${artistPart}-${productPart}-${sizePart}`;
}

function dedupeTrimmed(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export async function GET() {
  try {
    const auth = await requireArtistApiContext();
    if (!auth.ok) return auth.response;
    const { context } = auth;

    const products = await CanonicalProductModel.find({
      shopDomain: context.user.shopDomain,
      artistKey: context.user.artistKey,
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
        printSizes: ARTIST_PRINT_SIZES,
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
    const printSizeCodes = dedupeTrimmed(data.printSizeCodes).map((code) => code.toUpperCase());
    if (data.printsEnabled && printSizeCodes.length === 0) {
      return NextResponse.json({ ok: false, error: "print_sizes_required" }, { status: 400 });
    }
    const unknownSize = printSizeCodes.find((code) => !getArtistPrintSizeByCode(code));
    if (unknownSize) {
      return NextResponse.json({ ok: false, error: "invalid_print_size", sizeCode: unknownSize }, { status: 400 });
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
    const primaryUrls = resolveArtistMediaUrls(primaryImage);
    const galleryUrls = dedupeTrimmed(media.map((item) => resolveArtistMediaUrls(item).previewUrl).filter(Boolean));

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
        sku: buildSku(context.user.artistKey, productKey, "ORIGINAL"),
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
          productKey,
          variantKey: `print_${size.code.toLowerCase()}`,
          finish: "print",
          sizeCode: size.code,
          sku: buildSku(context.user.artistKey, productKey, size.code),
          priceCents: calculatePrintPriceCents({ widthCm: size.widthCm, heightCm: size.heightCm }),
          inventory: { tracked: false },
        });
      }
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

    await CanonicalProductModel.create({
      shopDomain: context.user.shopDomain,
      productKey,
      type: "artwork",
      title: data.title,
      description: data.description || undefined,
      artistKey: context.user.artistKey,
      artistRef: context.canonicalArtist.shopify?.metaobjectGid || undefined,
      seriesId,
      seriesName,
      offerings,
      forSale: data.forSale,
      allowPrints: data.printsEnabled,
      originalAvailable: data.originalAvailable,
      status: "db_only",
      year: data.year ?? undefined,
      images: {
        thumbUrl: primaryUrls.previewUrl,
        mediumUrl: primaryUrls.previewUrl,
        originalUrl: primaryUrls.url,
        galleryUrls,
      },
      dimensions: {
        widthCm: data.widthCm ?? undefined,
        heightCm: data.heightCm ?? undefined,
      },
      sync: {
        needsPush: false,
        dirtyAt: null,
        dirtyFields: [],
      },
    });

    try {
      await CanonicalVariantModel.insertMany(variantsToInsert, { ordered: true });
    } catch (error) {
      await CanonicalProductModel.deleteOne({
        shopDomain: context.user.shopDomain,
        productKey,
      }).catch(() => null);
      throw error;
    }

    return NextResponse.json({ ok: true, productKey }, { status: 201 });
  } catch (error) {
    return artistApiErrorResponse(error, "artwork_create_failed");
  }
}
