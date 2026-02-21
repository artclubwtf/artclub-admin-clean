import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import {
  fetchProductsByCollectionId,
  KUENSTLER_FIELD_KEYS,
  PRODUCT_METAFIELD_KEYS,
  SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
} from "@/lib/shopify";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosItemModel } from "@/models/PosItem";

type CollectionProduct = Awaited<ReturnType<typeof fetchProductsByCollectionId>>[number];

type FallbackShopifyProduct = {
  id: string;
  title: string;
  tags: string[];
  featuredImage: string | null;
  artistName?: string;
  artistMetaobjectGid?: string;
  variants: Array<{
    id: string;
    title: string;
    price: string | null;
    availableForSale: boolean;
    sku: string | null;
  }>;
};

const syncSchema = z.object({
  limitPerCollection: z.coerce.number().int().min(1).max(250).optional(),
});

function parsePriceToCents(raw: string | null): number {
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function pickBestVariant(product: { variants: FallbackShopifyProduct["variants"] | CollectionProduct["variants"] }) {
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

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function callShopifyAdmin(query: string, variables: Record<string, unknown>) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

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
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as { data?: unknown; errors?: unknown };
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as {
    products?: {
      edges?: Array<{
        node?: {
          id?: string;
          title?: string;
          tags?: string[] | null;
          featuredImage?: { url?: string | null } | null;
          images?: { nodes?: Array<{ url?: string | null }> } | null;
          variants?: {
            nodes?: Array<{
              id?: string;
              title?: string;
              price?: string | null;
              availableForSale?: boolean;
              sku?: string | null;
            }>;
          } | null;
          artistMetaobject?: {
            value?: string | null;
            reference?: {
              id?: string | null;
              fields?: Array<{ key: string; value?: string | null }>;
            } | null;
          } | null;
        };
      }>;
    };
  };
}

async function fetchArtworkProductsFallback(limit: number): Promise<FallbackShopifyProduct[]> {
  const query = `
    query ArtworkProductsForPOS($first: Int!) {
      products(first: $first, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            tags
            featuredImage { url }
            images(first: 1) { nodes { url } }
            variants(first: 25) {
              nodes {
                id
                title
                price
                availableForSale
                sku
              }
            }
            artistMetaobject: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
              value
              reference {
                ... on Metaobject {
                  id
                  fields { key value }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await callShopifyAdmin(query, { first: Math.min(Math.max(limit, 1), 250) });
  const edges = data.products?.edges || [];

  return edges.flatMap((edge) => {
    const node = edge.node;
    if (!node?.id || !node.title) return [];

    const tags = Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const isOriginalTagged = tags.some((tag) => tag.toLowerCase() === "original");

    const artistMetaobjectGid = node.artistMetaobject?.reference?.id ?? node.artistMetaobject?.value ?? undefined;
    const artistName = node.artistMetaobject?.reference?.fields?.find((field) => field.key === KUENSTLER_FIELD_KEYS.name)
      ?.value;
    const hasArtistRef = Boolean(artistMetaobjectGid);

    const isArtwork = hasArtistRef || isOriginalTagged;
    if (!isArtwork) return [];

    const featuredImage = node.featuredImage?.url || node.images?.nodes?.[0]?.url || null;
    const variants = Array.isArray(node.variants?.nodes)
      ? node.variants.nodes
          .filter((variant): variant is { id: string; title: string; price: string | null; availableForSale: boolean; sku: string | null } => Boolean(variant?.id))
          .map((variant) => ({
            id: variant.id,
            title: variant.title || "",
            price: typeof variant.price === "string" ? variant.price : null,
            availableForSale: Boolean(variant.availableForSale),
            sku: typeof variant.sku === "string" ? variant.sku : null,
          }))
      : [];

    return [
      {
        id: node.id,
        title: node.title,
        tags,
        featuredImage,
        artistMetaobjectGid,
        artistName: typeof artistName === "string" ? artistName : undefined,
        variants,
      },
    ];
  });
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

  try {
    const limitPerCollection = parsed.data.limitPerCollection ?? 100;
    const collectionGids = getArtworkCollectionGids();

    const productsById = new Map<
      string,
      {
        id: string;
        title: string;
        tags: string[];
        featuredImage: string | null;
        artistName?: string;
        variants: Array<{
          id: string;
          title: string;
          price: string | null;
          availableForSale: boolean;
          sku: string | null;
        }>;
      }
    >();

    if (collectionGids.length) {
      for (const collectionGid of collectionGids) {
        const products = await fetchProductsByCollectionId(collectionGid, limitPerCollection);
        for (const product of products) {
          productsById.set(product.id, {
            id: product.id,
            title: product.title,
            tags: product.tags,
            featuredImage: product.featuredImage,
            artistName: product.artistMetaobject?.name || undefined,
            variants: product.variants,
          });
        }
      }
    } else {
      const fallbackProducts = await fetchArtworkProductsFallback(limitPerCollection);
      for (const product of fallbackProducts) {
        productsById.set(product.id, product);
      }
    }

    const ops = Array.from(productsById.values()).map((product) => {
      const bestVariant = pickBestVariant(product);
      const priceGrossCents = parsePriceToCents(bestVariant?.price ?? null);
      const tags = product.tags.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
      const artistName = product.artistName?.trim() || undefined;
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
        mode: collectionGids.length ? "collection" : "fallback",
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
