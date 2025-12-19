import { PRODUCT_METAFIELD_KEYS, SHOPIFY_PRODUCT_NAMESPACE_CUSTOM } from "@/lib/shopify";

type MoneySet = { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null;

export type ShopifyOrderLine = {
  id: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productId: string | null;
  productTags: string[];
  artistMetaobjectGid: string | null;
};

export type ShopifyOrder = {
  id: string;
  name: string;
  createdAt: string;
  processedAt?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  currency: string;
  totalGross: number;
  lineItems: ShopifyOrderLine[];
};

export type ShopifyOrdersResult = {
  orders: ShopifyOrder[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

function getShopifyEnv(): { shop: string; token: string; version: string } {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shop || !token) {
    throw new Error("Missing Shopify credentials (SHOPIFY_SHOP_DOMAIN/SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN)");
  }
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  return { shop, token, version };
}

function parseMoney(input: MoneySet): { amount: number | null; currencyCode: string | null } {
  const amountRaw = input?.shopMoney?.amount;
  const currencyCode = input?.shopMoney?.currencyCode ?? null;
  if (amountRaw === undefined || amountRaw === null) return { amount: null, currencyCode };
  const amountNum = Number(amountRaw);
  return { amount: Number.isFinite(amountNum) ? amountNum : null, currencyCode };
}

function normalizeTags(tags?: (string | null)[] | null): string[] {
  return (tags || []).filter((t): t is string => Boolean(t)).map((t) => t);
}

export async function fetchShopifyOrders(params: {
  limit: number;
  after?: string | null;
  since?: string | null;
}): Promise<ShopifyOrdersResult> {
  const { limit, after = null, since = null } = params;
  const { shop, token, version } = getShopifyEnv();
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const queryParts: string[] = [];
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      queryParts.push(`created_at:>=${sinceDate.toISOString()}`);
    }
  }
  const queryString = queryParts.join(" ");

  const graphQuery = `
    query Orders($first: Int!, $after: String, $query: String) {
      orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            name
            createdAt
            processedAt
            financialStatus
            fulfillmentStatus
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet { shopMoney { amount currencyCode } }
                  originalTotalSet { shopMoney { amount currencyCode } }
                  discountedTotalSet { shopMoney { amount currencyCode } }
                  variant { title }
                  product {
                    id
                    title
                    tags
                    metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
                      reference { ... on Metaobject { id handle } }
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: graphQuery,
      variables: { first: limit, after, query: queryString || null },
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: {
      orders?: {
        edges?: { cursor: string; node: any }[];
        pageInfo?: { hasNextPage: boolean; endCursor: string | null };
      };
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const edges = json.data?.orders?.edges ?? [];
  const pageInfo = json.data?.orders?.pageInfo ?? { hasNextPage: false, endCursor: null };

  const orders: ShopifyOrder[] = edges.map(({ node }) => {
    const total = parseMoney(node?.currentTotalPriceSet);
    const currency = total.currencyCode || "EUR";

    const lineItems: ShopifyOrderLine[] =
      node?.lineItems?.edges?.map(({ node: li }: any) => {
        const unit = parseMoney(li?.originalUnitPriceSet);
        const discountedTotal = parseMoney(li?.discountedTotalSet);
        const originalTotal = parseMoney(li?.originalTotalSet);
        const lineTotal =
          discountedTotal.amount ??
          originalTotal.amount ??
          (Number.isFinite(unit.amount ?? null) ? (unit.amount as number) * Number(li?.quantity ?? 0) : 0);

        return {
          id: li?.id ?? "",
          title: li?.title ?? "Line item",
          variantTitle: li?.variant?.title ?? null,
          quantity: Number(li?.quantity ?? 0),
          unitPrice: unit.amount ?? 0,
          lineTotal,
          productId: li?.product?.id ?? null,
          productTags: normalizeTags(li?.product?.tags),
          artistMetaobjectGid: li?.product?.metafield?.reference?.id ?? null,
        };
      }) ?? [];

    return {
      id: node?.id ?? "",
      name: node?.name ?? "",
      createdAt: node?.createdAt ?? null,
      processedAt: node?.processedAt ?? null,
      financialStatus: node?.financialStatus ?? null,
      fulfillmentStatus: node?.fulfillmentStatus ?? null,
      currency,
      totalGross: total.amount ?? 0,
      lineItems,
    };
  });

  return { orders, pageInfo };
}
