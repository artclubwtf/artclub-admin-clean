type ShopifyProduct = { id: string; title: string };

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function fetchProducts(limit = 20): Promise<ShopifyProduct[]> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";

  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const query = `
    query Products($first: Int!) {
      products(first: $first) {
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
    body: JSON.stringify({ query, variables: { first: limit } }),
    // prevents caching in Next server env
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);

  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const edges = json.data?.products?.edges ?? [];
  return edges.map((e: any) => ({ id: e.node.id, title: e.node.title }));
}
