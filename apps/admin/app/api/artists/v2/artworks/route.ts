import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import {
  ARTIST_PRINT_SIZES,
  calculatePrintPriceCents,
  getArtistPrintSizeByCode,
} from "@/lib/artistPrintPricing";
import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import {
  CanonicalProductModel,
  canonicalProductOfferings,
} from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";
import { ArtistMediaV2Model } from "@/models/ArtistMediaV2";
import { ArtistSeriesModel } from "@/models/ArtistSeries";

const createArtworkSchema = z
  .object({
    title: z.string().trim().min(1),
    year: z.number().int().min(1000).max(9999).optional(),
    dimensions: z
      .object({
        widthCm: z.number().positive().max(1000).optional(),
        heightCm: z.number().positive().max(1000).optional(),
      })
      .strict()
      .optional(),
    shortText: z.string().trim().max(1000).optional().default(""),
    offerings: z.enum(canonicalProductOfferings),
    originalPriceEur: z.number().positive().max(100000).optional(),
    printSizeCodes: z.array(z.string().trim().min(1)).default([]),
    mediaIds: z.array(z.string().trim().min(1)).min(1),
    seriesId: z.string().trim().optional().or(z.literal("")),
    forSale: z.boolean().optional(),
    allowPrints: z.boolean().optional(),
    originalAvailable: z.boolean().optional(),
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
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const products = await CanonicalProductModel.find({
    shopDomain: context.user.shopDomain,
    artistKey: context.user.artistKey,
    type: "artwork",
  })
    .sort({ createdAt: -1 })
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
        year: product.year ?? null,
        shortText: product.shortText || "",
        offerings: product.offerings,
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        dimensions: {
          widthCm: product.dimensions?.widthCm ?? null,
          heightCm: product.dimensions?.heightCm ?? null,
        },
        images: {
          thumbUrl: product.images?.thumbUrl || "",
          mediumUrl: product.images?.mediumUrl || "",
          originalUrl: product.images?.originalUrl || "",
          galleryUrls: Array.isArray(product.images?.galleryUrls) ? product.images?.galleryUrls : [],
        },
        variants: (variantsByProduct[product.productKey] || []).map((variant) => ({
          id: variant._id.toString(),
          variantKey: variant.variantKey,
          finish: variant.finish,
          sizeCode: variant.sizeCode,
          sku: variant.sku,
          priceCents: variant.priceCents,
        })),
      })),
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = createArtworkSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const data = parsed.data;
  const printSizeCodes = dedupeTrimmed(data.printSizeCodes).map((code) => code.toUpperCase());
  const includeOriginal = data.offerings === "original_only" || data.offerings === "original_plus_prints";
  const includePrints = data.offerings === "prints_only" || data.offerings === "original_plus_prints";
  if (includePrints && printSizeCodes.length === 0) {
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
  const galleryUrls = dedupeTrimmed(media.map((item) => item.previewUrl || item.url || "").filter(Boolean));
  const originalPriceCents = Number.isFinite(data.originalPriceEur)
    ? Math.round((data.originalPriceEur ?? 0) * 100)
    : undefined;

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

  if (includeOriginal) {
    variantsToInsert.push({
      shopDomain: context.user.shopDomain,
      productKey,
      variantKey: "original",
      finish: "original",
      sizeCode: "ORIGINAL",
      sku: buildSku(context.user.artistKey, productKey, "ORIGINAL"),
      priceCents: originalPriceCents && originalPriceCents > 0 ? originalPriceCents : 0,
      inventory: { tracked: true },
    });
  }

  if (includePrints) {
    for (const sizeCode of printSizeCodes) {
      const size = getArtistPrintSizeByCode(sizeCode);
      if (!size) continue;
      const priceCents = calculatePrintPriceCents({
        widthCm: size.widthCm,
        heightCm: size.heightCm,
        originalPriceCents,
      });
      variantsToInsert.push({
        shopDomain: context.user.shopDomain,
        productKey,
        variantKey: `print_${size.code.toLowerCase()}`,
        finish: "print",
        sizeCode: size.code,
        sku: buildSku(context.user.artistKey, productKey, size.code),
        priceCents,
        inventory: { tracked: false },
      });
    }
  }

  if (!variantsToInsert.length) {
    return NextResponse.json({ ok: false, error: "no_variants_generated" }, { status: 400 });
  }

  const yearTag = typeof data.year === "number" ? `year:${data.year}` : null;
  const tags = dedupeTrimmed(
    [
      `artist_key:${context.user.artistKey}`,
      data.offerings === "prints_only" ? "prints" : null,
      data.offerings === "original_only" ? "original" : null,
      data.offerings === "original_plus_prints" ? "original" : null,
      data.offerings === "original_plus_prints" ? "prints" : null,
      yearTag,
    ].filter((value): value is string => typeof value === "string"),
  );

  await CanonicalProductModel.create({
    shopDomain: context.user.shopDomain,
    productKey,
    type: "artwork",
    title: data.title,
    artistKey: context.user.artistKey,
    artistRef: context.canonicalArtist.shopify?.metaobjectGid || undefined,
    seriesId,
    seriesName,
    offerings: data.offerings,
    forSale: data.forSale ?? true,
    allowPrints: data.allowPrints ?? includePrints,
    originalAvailable: data.originalAvailable ?? includeOriginal,
    status: "db_only",
    year: data.year,
    shortText: data.shortText || undefined,
    tags,
    images: {
      thumbUrl: primaryImage.previewUrl || primaryImage.url,
      mediumUrl: primaryImage.previewUrl || primaryImage.url,
      originalUrl: primaryImage.url,
      galleryUrls,
    },
    dimensions: {
      widthCm: data.dimensions?.widthCm,
      heightCm: data.dimensions?.heightCm,
    },
    sync: {
      needsPush: false,
      dirtyAt: null,
      dirtyFields: [],
    },
  });

  await CanonicalVariantModel.insertMany(variantsToInsert, { ordered: true });

  const insertedVariants = await CanonicalVariantModel.find({
    shopDomain: context.user.shopDomain,
    productKey,
  }).lean();

  return NextResponse.json(
    {
      ok: true,
      artwork: {
        productKey,
        title: data.title,
        year: data.year ?? null,
        offerings: data.offerings,
        status: "db_only",
        shortText: data.shortText || "",
        images: {
          thumbUrl: primaryImage.previewUrl || primaryImage.url,
          mediumUrl: primaryImage.previewUrl || primaryImage.url,
          originalUrl: primaryImage.url,
          galleryUrls,
        },
        variants: insertedVariants.map((variant) => ({
          id: variant._id.toString(),
          variantKey: variant.variantKey,
          finish: variant.finish,
          sizeCode: variant.sizeCode,
          sku: variant.sku,
          priceCents: variant.priceCents,
        })),
      },
    },
    { status: 201 },
  );
}
