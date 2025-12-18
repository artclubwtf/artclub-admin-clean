import { NextResponse } from "next/server";
import { PRODUCT_METAFIELD_KEYS, SHOPIFY_PRODUCT_NAMESPACE_CUSTOM } from "@/lib/shopify";

type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  status?: string | null;
  featuredImage?: { url?: string | null } | null;
  variants?: { edges?: Array<{ node?: { price?: { amount: string; currencyCode: string } | null } }> } | null;
  metafieldWidth?: { value?: string | null } | null;
  metafieldHeight?: { value?: string | null } | null;
  metafieldKurzbeschreibung?: { value?: string | null } | null;
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function parseDecimal(value?: string | null): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildShopifyAdminProductUrl(shopDomain: string, productGid: string): string | null {
  const numericId = productGid.split("/").pop();
  if (!numericId) return null;

  const normalizedDomain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (normalizedDomain.startsWith("admin.shopify.com")) {
    const segments = normalizedDomain.split("/").filter(Boolean);
    const storeIndex = segments.findIndex((segment) => segment === "store");
    const store = storeIndex >= 0 ? segments[storeIndex + 1] : segments[segments.length - 1];
    if (!store) return null;
    return `https://admin.shopify.com/store/${store}/products/${numericId}`;
  }

  return `https://${normalizedDomain}/admin/products/${numericId}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const artistMetaobjectGid = searchParams.get("artistMetaobjectGid")?.trim();
    if (!artistMetaobjectGid) {
      return NextResponse.json({ error: "artistMetaobjectGid is required" }, { status: 400 });
    }

    const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
    const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const version = process.env.SHOPIFY_API_VERSION || "2024-10";
    const url = `https://${shop}/admin/api/${version}/graphql.json`;

    const escapedMetaobjectId = artistMetaobjectGid.replace(/'/g, "\\'");
    // Shopify product search expects the metafield query in the format metafield:'namespace.key:value'
    const searchQuery = `metafield:'${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}.${PRODUCT_METAFIELD_KEYS.artistMetaobject}:${escapedMetaobjectId}'`;

    const query = `
      query ProductsByArtist($first: Int!, $query: String!) {
        products(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
              status
              featuredImage { url }
              variants(first: 1) {
                edges {
                  node {
                    price { amount currencyCode }
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
      return NextResponse.json({ error: `Shopify API error ${res.status}`, details: text }, { status: 500 });
    }

    const json = JSON.parse(text) as {
      data?: { products?: { edges?: { node: ShopifyProductNode }[] } };
      errors?: unknown;
    };
    if (json.errors) {
      const details = Array.isArray(json.errors) ? json.errors.map((e) => e.message || e).join("; ") : "Shopify GraphQL errors";
      return NextResponse.json({ error: details, details: json.errors }, { status: 500 });
    }

    const edges: { node: ShopifyProductNode }[] = json.data?.products?.edges ?? [];
    const products = edges.map(({ node }) => {
      const firstVariantPriceNode = node?.variants?.edges?.[0]?.node?.price;
      const firstVariantPrice = firstVariantPriceNode
        ? `${firstVariantPriceNode.amount} ${firstVariantPriceNode.currencyCode}`.trim()
        : null;

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        status: node.status || null,
        firstVariantPrice,
        imageUrl: node.featuredImage?.url ?? null,
        breiteCm: parseDecimal(node.metafieldWidth?.value),
        heightCm: parseDecimal(node.metafieldHeight?.value),
        kurzbeschreibung: node.metafieldKurzbeschreibung?.value ?? null,
        shopifyAdminUrl: buildShopifyAdminProductUrl(shop, node.id),
      };
    });

    return NextResponse.json({ products }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch Shopify products by artist", err);
    const message = err instanceof Error ? err.message : "Failed to fetch products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
