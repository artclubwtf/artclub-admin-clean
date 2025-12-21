import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { buildShopifyAdminProductUrl } from "@/lib/shopifyArtworks";
import { PRODUCT_METAFIELD_KEYS, SHOPIFY_PRODUCT_NAMESPACE_CUSTOM } from "@/lib/shopify";

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function fetchProductsByArtistMetaobject(metaobjectId: string) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const escapedMetaobjectId = metaobjectId.replace(/'/g, "\\'");
  const searchQuery = `metafield:'${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.artistMetaobject}:${escapedMetaobjectId}'`;

  const query = `
    query ProductsByArtist($first: Int!, $query: String!) {
      products(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            status
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
      }
    }
  `;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: { first: 50, query: searchQuery } }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { products?: { edges?: { node: any }[] } };
    errors?: unknown;
  };
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const edges = json.data?.products?.edges ?? [];
  const payload = edges.map(({ node }) => ({
    id: node.id as string,
    title: node.title as string,
    status: (node.status as string | undefined) ?? "DRAFT",
    price: node.priceRangeV2?.minVariantPrice?.amount || null,
    currency: node.priceRangeV2?.minVariantPrice?.currencyCode || null,
    imageUrl: node.featuredImage?.url || null,
    adminUrl: buildShopifyAdminProductUrl(shop, node.id as string),
  }));

  return payload;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "artist" || !session.user.artistId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectMongo();
    const artist = await ArtistModel.findById(session.user.artistId).select({ shopifySync: 1 }).lean();
    if (!artist || !artist.shopifySync?.metaobjectId) {
      return NextResponse.json({ products: [] }, { status: 200 });
    }

    const products = await fetchProductsByArtistMetaobject(artist.shopifySync.metaobjectId);
    return NextResponse.json({ products }, { status: 200 });
  } catch (err: any) {
    console.error("Failed to fetch artist Shopify products", err);
    return NextResponse.json({ error: err?.message || "Failed to load products" }, { status: 500 });
  }
}
