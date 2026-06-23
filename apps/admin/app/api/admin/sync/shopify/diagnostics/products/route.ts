import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { mapShopifyProductToCanonicalArtist } from "@/lib/sync/shopifyMapping";
import { createSyncRunId, logShopifyDiagnostics, logSyncError } from "@/lib/sync/syncLogger";
import { resolveShopDomain } from "@/lib/shopDomain";

type ShopifyGraphQLResponse<TData> = {
  data?: TData;
  errors?: unknown;
};

type ProductDiagnosticsNode = {
  id?: string | null;
  handle?: string | null;
  title?: string | null;
  vendor?: string | null;
  status?: string | null;
  images?: { nodes?: Array<{ url?: string | null }> | null } | null;
  variants?: { nodes?: Array<{ id?: string | null }> | null } | null;
  artistKunstler?: { value?: string | null; reference?: { id?: string | null } | null } | null;
  artistLegacyKuenstler?: { value?: string | null } | null;
};

type ProductDiagnosticsResponse = {
  products?: {
    edges?: Array<{ node?: ProductDiagnosticsNode | null }> | null;
    pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  } | null;
};

async function callShopifyAdmin<TData>(query: string, variables: Record<string, unknown>): Promise<TData | undefined> {
  const shopDomain = resolveShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN);
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shopDomain || !token) throw new Error("Missing Shopify credentials");

  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shopDomain}/admin/api/${version}/graphql.json`;
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
  const json = JSON.parse(text) as ShopifyGraphQLResponse<TData>;
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  if (json.errors) throw new Error("Shopify GraphQL errors");
  return json.data;
}

async function fetchProductsForArtistSlug(artistSlug: string) {
  const query = `
    query ProductDiagnostics($first: Int!, $after: String, $search: String) {
      products(first: $first, after: $after, query: $search, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            handle
            title
            vendor
            status
            images(first: 20) {
              nodes {
                url
              }
            }
            artistKunstler: metafield(namespace: "custom", key: "kunstler") {
              value
              reference {
                ... on Metaobject {
                  id
                }
              }
            }
            artistLegacyKuenstler: metafield(namespace: "custom", key: "kuenstler") {
              value
            }
            variants(first: 100) {
              nodes {
                id
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const search = `metafields.custom.kunstler:'${artistSlug}' OR metafields.custom.kuenstler:'${artistSlug}'`;
  const direct = await callShopifyAdmin<ProductDiagnosticsResponse>(query, { first: 100, after: null, search });
  const directNodes = (direct?.products?.edges || []).map((edge) => edge?.node).filter(Boolean) as ProductDiagnosticsNode[];
  if (directNodes.length > 0) {
    return { products: directNodes, source: "shopify_query" as const };
  }

  const scanned = await callShopifyAdmin<ProductDiagnosticsResponse>(query, { first: 100, after: null, search: null });
  const nodes = (scanned?.products?.edges || []).map((edge) => edge?.node).filter(Boolean) as ProductDiagnosticsNode[];
  return {
    products: nodes.filter((node) => {
      const customKunstlerValue = (node.artistKunstler?.value || node.artistKunstler?.reference?.id || "").trim();
      const customKuenstlerValue = (node.artistLegacyKuenstler?.value || "").trim();
      return customKunstlerValue === artistSlug || customKuenstlerValue === artistSlug;
    }),
    source: "first100_fallback" as const,
  };
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const artistSlug = (url.searchParams.get("artistSlug") || "").trim();
  if (!artistSlug) {
    return NextResponse.json({ ok: false, error: "missing_artist_slug" }, { status: 400 });
  }

  const runId = createSyncRunId("shopify-diagnostics-products");
  const shopDomain = resolveShopDomain();
  logShopifyDiagnostics(
    "product_diagnostics_started",
    {
      runId,
      service: "admin",
      artistSlug,
      shopDomain: shopDomain || null,
      hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      hasMongoUri: Boolean(process.env.MONGODB_URI),
    },
    { runId, force: true },
  );

  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain", runId }, { status: 500 });
  }

  try {
    await connectMongo();
    const { products, source } = await fetchProductsForArtistSlug(artistSlug);

    const productPayloads = [] as Array<Record<string, unknown>>;
    for (const product of products) {
      const customKunstlerValue = (product.artistKunstler?.value || product.artistKunstler?.reference?.id || "").trim() || null;
      const customKuenstlerValue = (product.artistLegacyKuenstler?.value || "").trim() || null;

      logShopifyDiagnostics(
        "shopify_product_diagnostics_raw",
        {
          productId: product.id || null,
          handle: product.handle || null,
          title: product.title || null,
          vendor: product.vendor || null,
          status: product.status || null,
          imageCount: (product.images?.nodes || []).filter((image) => image?.url).length,
          variantCount: (product.variants?.nodes || []).length,
          metafields: [
            customKunstlerValue ? "custom.kunstler" : null,
            customKuenstlerValue ? "custom.kuenstler" : null,
          ].filter(Boolean),
          customKunstlerValue,
          customKuenstlerValue,
        },
        { runId, force: true },
      );

      const mapping = await mapShopifyProductToCanonicalArtist({
        shopDomain,
        customKunstlerValue,
        customKuenstlerValue,
      });

      logShopifyDiagnostics(
        "shopify_product_artist_mapping_check",
        {
          productId: product.id || null,
          handle: product.handle || null,
          title: product.title || null,
          customKunstlerValue,
          canonicalArtistMatched: Boolean(mapping.selectedArtist),
          canonicalArtistId: mapping.selectedArtistId || null,
          reason: mapping.reason,
        },
        { runId, force: true },
      );

      productPayloads.push({
        productId: product.id || null,
        handle: product.handle || null,
        title: product.title || null,
        vendor: product.vendor || null,
        status: product.status || null,
        imageCount: (product.images?.nodes || []).filter((image) => image?.url).length,
        variantCount: (product.variants?.nodes || []).length,
        customKunstlerValue,
        customKuenstlerValue,
        canonicalArtistMatched: Boolean(mapping.selectedArtist),
        canonicalArtistId: mapping.selectedArtistId || null,
        mappingReason: mapping.reason,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        runId,
        source,
        artistSlug,
        products: productPayloads,
      },
      { status: 200 },
    );
  } catch (error) {
    logSyncError(
      "product_diagnostics_failed",
      error,
      {
        artistSlug,
        shopDomain,
      },
      { runId, force: true },
    );
    return NextResponse.json({ ok: false, error: "product_diagnostics_failed", runId }, { status: 500 });
  }
}
