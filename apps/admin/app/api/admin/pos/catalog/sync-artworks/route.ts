import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { fetchProductsByCollectionId } from "@/lib/shopify";
import { PosItemModel } from "@/models/PosItem";

type CollectionProduct = Awaited<ReturnType<typeof fetchProductsByCollectionId>>[number];

const syncSchema = z.object({
  limitPerCollection: z.coerce.number().int().min(1).max(250).optional(),
});

function parsePriceToCents(raw: string | null): number {
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function pickBestVariant(product: CollectionProduct) {
  const pricedVariants = product.variants.filter((variant) => {
    if (!variant.id) return false;
    const cents = parsePriceToCents(variant.price);
    return cents >= 0;
  });

  if (pricedVariants.length === 0) return null;
  const available = pricedVariants.find((variant) => variant.availableForSale);
  return available || pricedVariants[0];
}

function getArtworkCollectionGids() {
  return (process.env.SHOPIFY_ARTWORK_COLLECTION_GIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = syncSchema.safeParse(body || {});
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  const collectionGids = getArtworkCollectionGids();
  if (!collectionGids.length) {
    return NextResponse.json({ ok: false, error: "missing_artwork_collection_ids" }, { status: 400 });
  }

  try {
    const limitPerCollection = parsed.data.limitPerCollection ?? 100;

    const productsById = new Map<string, CollectionProduct>();
    for (const collectionGid of collectionGids) {
      const products = await fetchProductsByCollectionId(collectionGid, limitPerCollection);
      for (const product of products) {
        productsById.set(product.id, product);
      }
    }

    const ops = Array.from(productsById.values()).map((product) => {
      const bestVariant = pickBestVariant(product);
      const priceGrossCents = parsePriceToCents(bestVariant?.price ?? null);
      const tags = product.tags.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
      const artistName = product.artistMetaobject?.name?.trim() || undefined;
      const sku = bestVariant?.sku?.trim() || undefined;

      return {
        updateOne: {
          filter: { shopifyProductGid: product.id },
          update: {
            $set: {
              type: "artwork" as const,
              title: product.title,
              sku,
              priceGrossCents,
              vatRate: 19 as const,
              currency: "EUR" as const,
              imageUrl: product.featuredImage || undefined,
              artistName,
              shopifyProductGid: product.id,
              shopifyVariantGid: bestVariant?.id || undefined,
              tags,
              isActive: true,
            },
          },
          upsert: true,
        },
      };
    });

    await connectMongo();
    const result = ops.length ? await PosItemModel.bulkWrite(ops, { ordered: false }) : null;

    return NextResponse.json(
      {
        ok: true,
        scannedCollections: collectionGids.length,
        fetchedProducts: productsById.size,
        upsertedCount: result?.upsertedCount ?? 0,
        modifiedCount: result?.modifiedCount ?? 0,
        matchedCount: result?.matchedCount ?? 0,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_sync_artworks";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
