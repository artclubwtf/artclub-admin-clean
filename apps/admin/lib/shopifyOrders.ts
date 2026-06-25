import { PRODUCT_METAFIELD_KEYS, SHOPIFY_PRODUCT_NAMESPACE_CUSTOM } from "./shopify";

type MoneySet = { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null;

export type ShopifyOrderLine = {
  id: string;
  title: string;
  variantTitle: string | null;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  refundedQuantity: number;
  refundedAmount: number;
  productId: string | null;
  productHandle: string | null;
  vendor: string | null;
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
  cancelledAt?: string | null;
  refundedAmount?: number | null;
  refundedTotalGross?: number | null;
  currency: string;
  totalGross: number;
  lineItems: ShopifyOrderLine[];
};

export type ShopifyOrdersResult = {
  orders: ShopifyOrder[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

function mapShopifyOrderNode(node: any): ShopifyOrder {
  const total = parseMoney(node?.currentTotalPriceSet);
  const refunded = parseMoney(node?.totalRefundedSet);
  const currency = node?.currencyCode ?? total.currencyCode ?? "EUR";
  const refundByLineId = new Map<string, { refundedQuantity: number; refundedAmount: number }>();

  for (const refund of Array.isArray(node?.refunds) ? node.refunds : []) {
    const refundLineItems = refund?.refundLineItems?.nodes ?? refund?.refundLineItems?.edges?.map(({ node: refundLine }: any) => refundLine) ?? [];
    for (const refundLine of refundLineItems) {
      const lineItemId = refundLine?.lineItem?.id;
      if (!lineItemId) continue;
      const subtotal = parseMoney(refundLine?.subtotalSet);
      const totalTax = parseMoney(refundLine?.totalTaxSet);
      const refundedAmount = Number(subtotal.amount || 0) + Number(totalTax.amount || 0);
      const existing = refundByLineId.get(lineItemId) || { refundedQuantity: 0, refundedAmount: 0 };
      existing.refundedQuantity += Number(refundLine?.quantity || 0);
      existing.refundedAmount += refundedAmount;
      refundByLineId.set(lineItemId, existing);
    }
  }

  const lineItems: ShopifyOrderLine[] =
    node?.lineItems?.edges?.map(({ node: li }: any) => {
      const unit = parseMoney(li?.originalUnitPriceSet);
      const discountedTotal = parseMoney(li?.discountedTotalSet);
      const originalTotal = parseMoney(li?.originalTotalSet);
      const refundedLine = refundByLineId.get(li?.id ?? "") || { refundedQuantity: 0, refundedAmount: 0 };
      const lineTotal =
        discountedTotal.amount ??
        originalTotal.amount ??
        (Number.isFinite(unit.amount ?? null) ? (unit.amount as number) * Number(li?.quantity ?? 0) : 0);

      return {
        id: li?.id ?? "",
        title: li?.title ?? "Line item",
        variantTitle: li?.variant?.title ?? null,
        variantId: li?.variant?.id ?? null,
        quantity: Number(li?.quantity ?? 0),
        unitPrice: unit.amount ?? 0,
        lineTotal,
        refundedQuantity: Number(refundedLine.refundedQuantity || 0),
        refundedAmount: Number(refundedLine.refundedAmount || 0),
        productId: li?.product?.id ?? null,
        productHandle: li?.product?.handle ?? null,
        vendor: li?.product?.vendor ?? null,
        productTags: normalizeTags(li?.product?.tags),
        artistMetaobjectGid: li?.product?.metafield?.reference?.id ?? null,
      };
    }) ?? [];

  return {
    id: node?.id ?? "",
    name: node?.name ?? "",
    createdAt: node?.createdAt ?? null,
    processedAt: node?.processedAt ?? null,
    financialStatus: node?.displayFinancialStatus ?? null,
    fulfillmentStatus: node?.displayFulfillmentStatus ?? null,
    cancelledAt: node?.cancelledAt ?? null,
    refundedAmount: refunded.amount ?? 0,
    refundedTotalGross: refunded.amount ?? 0,
    currency,
    totalGross: total.amount ?? 0,
    lineItems,
  };
}

const SHOPIFY_ORDER_FIELDS = `
  id
  name
  createdAt
  processedAt
  currencyCode
  displayFinancialStatus
  displayFulfillmentStatus
  cancelledAt
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  totalRefundedSet { shopMoney { amount currencyCode } }
  refunds {
    id
    totalRefundedSet { shopMoney { amount currencyCode } }
    refundLineItems(first: 100) {
      nodes {
        lineItem { id }
        quantity
        subtotalSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
      }
    }
  }
  lineItems(first: 100) {
    edges {
      node {
        id
        title
        quantity
        originalUnitPriceSet { shopMoney { amount currencyCode } }
        originalTotalSet { shopMoney { amount currencyCode } }
        discountedTotalSet { shopMoney { amount currencyCode } }
        variant { id title }
        product {
          id
          handle
          title
          vendor
          tags
          metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
            reference { ... on Metaobject { id handle } }
          }
        }
      }
    }
  }
`;

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
            ${SHOPIFY_ORDER_FIELDS}
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
  const orders: ShopifyOrder[] = edges.map(({ node }) => mapShopifyOrderNode(node));

  return { orders, pageInfo };
}

export async function fetchShopifyOrderById(orderId: string): Promise<ShopifyOrder | null> {
  const { shop, token, version } = getShopifyEnv();
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const graphQuery = `
    query OrderById($id: ID!) {
      order(id: $id) {
        ${SHOPIFY_ORDER_FIELDS}
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
      variables: { id: orderId },
    }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as {
    data?: { order?: any | null };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const node = json.data?.order;
  return node ? mapShopifyOrderNode(node) : null;
}
