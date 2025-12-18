import { NextResponse } from "next/server";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type ShopifyCollection = { id: string; title: string };

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
    const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const version = process.env.SHOPIFY_API_VERSION || "2024-10";
    const url = `https://${shop}/admin/api/${version}/graphql.json`;

    // Shopify supports collection search via the "query" argument; we still filter on the server
    // in case the query string is ignored to keep behavior predictable.
    const first = q ? 50 : 20;
    const query = `
      query Collections($first: Int!, $query: String) {
        collections(first: $first, query: $query, sortKey: TITLE) {
          edges {
            node {
              id
              title
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
      body: JSON.stringify({ query, variables: { first, query: q ? `title:*${q}*` : null } }),
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `Shopify API error ${res.status}`, details: text }, { status: 500 });
    }

    const json = JSON.parse(text) as any;
    if (json.errors) {
      return NextResponse.json({ error: "Shopify GraphQL errors", details: json.errors }, { status: 500 });
    }

    const edges: { node: ShopifyCollection }[] = json.data?.collections?.edges ?? [];
    let collections = edges.map(({ node }) => node);

    if (q) {
      const needle = q.toLowerCase();
      collections = collections.filter((c) => c.title?.toLowerCase().includes(needle));
    }

    // return a small list only
    collections = collections.slice(0, 20);

    return NextResponse.json({ collections }, { status: 200 });
  } catch (err: any) {
    console.error("Failed to fetch Shopify collections", err);
    return NextResponse.json({ error: err?.message || "Failed to fetch collections" }, { status: 500 });
  }
}
