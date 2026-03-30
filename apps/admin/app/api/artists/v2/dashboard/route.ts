import { NextResponse } from "next/server";
import { z } from "zod";

import { ARTIST_PRINT_SIZES } from "@/lib/artistPrintPricing";
import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { CanonicalVariantModel } from "@/models/CanonicalVariant";

const consentsSchema = z
  .object({
    allowOriginalSales: z.boolean(),
    allowPrintSales: z.boolean(),
    allowRental: z.boolean(),
    allowExhibitions: z.boolean(),
    presentationOnly: z.boolean(),
  })
  .strict();

function uniqueTrimmed(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export async function GET() {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const { user, canonicalArtist } = context;

  const products = await CanonicalProductModel.find({
    shopDomain: user.shopDomain,
    artistKey: user.artistKey,
    type: "artwork",
  })
    .sort({ createdAt: -1 })
    .lean();

  const productKeys = uniqueTrimmed(products.map((item) => item.productKey || ""));
  const variants = productKeys.length
    ? await CanonicalVariantModel.find({
        shopDomain: user.shopDomain,
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
      artist: {
        artistKey: user.artistKey,
        onboardingComplete: user.onboardingComplete === true,
        email: user.email,
        handle: canonicalArtist.handle || "",
        displayName: canonicalArtist.displayName || "",
        instagram: canonicalArtist.instagram || "",
        profileImages: {
          avatarUrl: canonicalArtist.profileImages?.avatarUrl || "",
          heroUrl: canonicalArtist.profileImages?.heroUrl || "",
          galleryUrls: Array.isArray(canonicalArtist.profileImages?.galleryUrls)
            ? canonicalArtist.profileImages.galleryUrls
            : [],
        },
        consents: {
          allowOriginalSales: canonicalArtist.consents?.allowOriginalSales === true,
          allowPrintSales: canonicalArtist.consents?.allowPrintSales === true,
          allowRental: canonicalArtist.consents?.allowRental === true,
          allowExhibitions: canonicalArtist.consents?.allowExhibitions === true,
          presentationOnly: canonicalArtist.consents?.presentationOnly === true,
        },
      },
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

export async function PATCH(req: Request) {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const payload = (await req.json().catch(() => null)) as unknown;
  const parsed = consentsSchema.safeParse(payload || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const { user, canonicalArtist } = context;

  await CanonicalArtistModel.updateOne(
    { _id: canonicalArtist._id, shopDomain: user.shopDomain, artistKey: user.artistKey },
    {
      $set: {
        consents: {
          allowOriginalSales: parsed.data.allowOriginalSales,
          allowPrintSales: parsed.data.allowPrintSales,
          allowRental: parsed.data.allowRental,
          allowExhibitions: parsed.data.allowExhibitions,
          presentationOnly: parsed.data.presentationOnly,
        },
      },
    },
  );

  return NextResponse.json({ ok: true, consents: parsed.data }, { status: 200 });
}
