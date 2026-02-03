import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ShopifyArtworkCacheModel } from "@/models/ShopifyArtworkCache";
import { KUENSTLER_FIELD_KEYS, PRODUCT_METAFIELD_KEYS, SHOPIFY_PRODUCT_NAMESPACE_CUSTOM } from "@/lib/shopify";

type SyncRequestBody = {
  limit?: number;
  cursor?: string;
  full?: boolean;
};

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  status?: string | null;
  tags?: string[] | null;
  updatedAt?: string | null;
  featuredImage?: { url?: string | null } | null;
  images?: { nodes?: { url?: string | null }[] } | null;
  variants?: { nodes?: { price?: string | null }[] } | null;
  artistMetaobject?: {
    value?: string | null;
    reference?: { id?: string | null; fields?: { key: string; value?: string | null }[] } | null;
  } | null;
  metafieldWidth?: { value?: string | null } | null;
  metafieldHeight?: { value?: string | null } | null;
  metafieldKurzbeschreibung?: { value?: string | null } | null;
  collections?: { nodes?: { id?: string | null }[] } | null;
};

type ShopifyProductsResponse = {
  data?: {
    products?: {
      edges?: { node: ShopifyProductNode }[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  };
  errors?: unknown;
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function parseDecimal(value?: string | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSizedImageUrl(url: string, width: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}width=${width}`;
}

function parseNumericId(productGid: string) {
  const parts = productGid.split("/");
  return parts[parts.length - 1] || undefined;
}

function getMetaobjectFieldValue(
  fields: { key: string; value?: string | null }[] | undefined,
  key: string,
) {
  if (!fields) return null;
  const match = fields.find((field) => field.key === key);
  return match?.value ?? null;
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

  const json = JSON.parse(text) as ShopifyProductsResponse;
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as SyncRequestBody | null;
    const limitRaw = body?.limit;
    const limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : undefined;
    const pageSize = Math.min(Math.max(limit ?? 50, 1), 250);
    const full = Boolean(body?.full);
    const initialCursor = typeof body?.cursor === "string" && body.cursor.trim() ? body.cursor.trim() : undefined;

    const collectionIds = (process.env.SHOPIFY_ARTWORK_COLLECTION_GIDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const collectionSet = new Set(collectionIds);

    await connectMongo();

    const query = `
      query ArtworkProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              handle
              title
              status
              tags
              updatedAt
              featuredImage { url }
              images(first: 1) { nodes { url } }
              variants(first: 1) { nodes { price } }
              artistMetaobject: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
                value
                reference {
                  ... on Metaobject {
                    id
                    fields { key value }
                  }
                }
              }
              metafieldWidth: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.width}") {
                value
              }
              metafieldHeight: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.height}") {
                value
              }
              metafieldKurzbeschreibung: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.kurzbeschreibung}") {
                value
              }
              collections(first: 5) { nodes { id } }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let cursor = initialCursor;
    let imported = 0;
    let nextCursor: string | undefined = undefined;

    while (true) {
      const data = await callShopifyAdmin(query, { first: pageSize, after: cursor || null });
      const edges = data?.products?.edges ?? [];
      const pageInfo = data?.products?.pageInfo;

      const ops = edges.flatMap(({ node }) => {
        if (!node?.id) return [];

        const tags = Array.isArray(node.tags) ? node.tags.filter((tag): tag is string => typeof tag === "string") : [];
        const tagsLower = tags.map((tag) => tag.toLowerCase());
        const isOriginalTagged = tagsLower.includes("original");

        const artistMetaobjectGid =
          node.artistMetaobject?.reference?.id ?? node.artistMetaobject?.value ?? undefined;

        const inCollection =
          collectionSet.size > 0 &&
          (node.collections?.nodes || []).some((collection) => collection?.id && collectionSet.has(collection.id));

        const isArtwork = Boolean(artistMetaobjectGid || isOriginalTagged || inCollection);
        if (!isArtwork) return [];

        const imageUrl =
          node.featuredImage?.url || node.images?.nodes?.[0]?.url || null;
        if (!imageUrl) return [];

        const artistName =
          node.artistMetaobject?.reference?.fields
            ? getMetaobjectFieldValue(node.artistMetaobject.reference.fields, KUENSTLER_FIELD_KEYS.name)
            : null;

        let updatedAtShopify = node.updatedAt ? new Date(node.updatedAt) : undefined;
        if (updatedAtShopify && Number.isNaN(updatedAtShopify.getTime())) {
          updatedAtShopify = undefined;
        }
        const priceEur = parseDecimal(node.variants?.nodes?.[0]?.price ?? null);

        return [
          {
            updateOne: {
              filter: { productGid: node.id },
              update: {
                $set: {
                  productGid: node.id,
                  productNumericId: parseNumericId(node.id),
                  title: node.title,
                  handle: node.handle,
                  artistMetaobjectGid,
                  artistName: artistName ?? undefined,
                  tags,
                  status: node.status || "UNKNOWN",
                  images: {
                    thumbUrl: buildSizedImageUrl(imageUrl, 360),
                    mediumUrl: buildSizedImageUrl(imageUrl, 960),
                    originalUrl: imageUrl,
                  },
                  widthCm: parseDecimal(node.metafieldWidth?.value),
                  heightCm: parseDecimal(node.metafieldHeight?.value),
                  shortDescription: node.metafieldKurzbeschreibung?.value ?? undefined,
                  isOriginalTagged,
                  priceEur,
                  updatedAtShopify,
                  lastImportedAt: new Date(),
                },
              },
              upsert: true,
            },
          },
        ];
      });

      if (ops.length) {
        const result = await ShopifyArtworkCacheModel.bulkWrite(ops, { ordered: false });
        imported += result.upsertedCount + result.modifiedCount;
      }

      if (!pageInfo?.hasNextPage) {
        nextCursor = undefined;
        break;
      }

      cursor = pageInfo.endCursor || undefined;
      nextCursor = cursor;

      if (!full) break;
      if (!cursor) break;
    }

    return NextResponse.json({ ok: true, imported, nextCursor }, { status: 200 });
  } catch (err) {
    console.error("Failed to sync Shopify artworks", err);
    const message = err instanceof Error ? err.message : "Failed to sync artworks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
