import { resolveShopDomain } from "@/lib/shopDomain";
import type {
  ShopifyArtistMetaobjectNode,
  ShopifyFieldReferenceNode,
  ShopifyMetaobjectField,
} from "@/lib/sync/shopifyMapping";

type ShopifyGraphQLResponse<TData> = {
  data?: TData;
  errors?: unknown;
};

type ShopifyNodesResponse = {
  nodes?: Array<{
    __typename?: string | null;
    id?: string | null;
    url?: string | null;
    handle?: string | null;
    displayName?: string | null;
    image?: {
      url?: string | null;
      altText?: string | null;
      width?: number | null;
      height?: number | null;
    } | null;
  } | null> | null;
};

type ShopifyNode = NonNullable<NonNullable<ShopifyNodesResponse["nodes"]>[number]>;

function fieldValue(field?: ShopifyMetaobjectField | null) {
  const value = field?.value?.trim();
  return value || undefined;
}

function isShopifyGid(value?: string | null) {
  const trimmed = value?.trim();
  return Boolean(trimmed && trimmed.startsWith("gid://shopify/"));
}

function mapNodeToReference(node?: ShopifyNode | null): ShopifyFieldReferenceNode | null {
  if (!node?.id) return null;
  const typename = node.__typename?.trim();
  if (typename === "MediaImage") {
    return {
      __typename: "MediaImage",
      id: node.id,
      image: {
        url: node.image?.url?.trim() || null,
        altText: node.image?.altText?.trim() || null,
        width: typeof node.image?.width === "number" ? node.image.width : null,
        height: typeof node.image?.height === "number" ? node.image.height : null,
      },
    };
  }
  if (typename === "GenericFile") {
    return {
      __typename: "GenericFile",
      id: node.id,
      url: node.url?.trim() || null,
    };
  }
  if (typename === "Metaobject") {
    return {
      __typename: "Metaobject",
      id: node.id,
      handle: node.handle?.trim() || null,
      displayName: node.displayName?.trim() || null,
    };
  }
  return null;
}

export function collectShopifyReferenceGids(fields: ShopifyMetaobjectField[] | null | undefined): string[] {
  const values = new Set<string>();
  for (const field of fields || []) {
    const rawValue = fieldValue(field);
    if (!rawValue || !isShopifyGid(rawValue)) continue;
    if (field?.reference || (field?.references?.nodes || []).some(Boolean)) continue;
    values.add(rawValue);
  }
  return [...values];
}

export async function resolveShopifyReferenceNodes(ids: string[]): Promise<Record<string, ShopifyFieldReferenceNode>> {
  const uniqueIds = Array.from(new Set(ids.map((value) => value.trim()).filter(Boolean)));
  if (!uniqueIds.length) return {};

  const shopDomain = resolveShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN);
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shopDomain || !token) {
    throw new Error("Missing Shopify credentials");
  }

  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shopDomain}/admin/api/${version}/graphql.json`;
  const query = `
    query ResolveShopifyNodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        __typename
        ... on MediaImage {
          id
          image {
            url
            altText
            width
            height
          }
        }
        ... on GenericFile {
          id
          url
        }
        ... on Metaobject {
          id
          handle
          displayName
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
    body: JSON.stringify({ query, variables: { ids: uniqueIds } }),
    cache: "no-store",
  });

  const text = await res.text();
  const json = JSON.parse(text) as ShopifyGraphQLResponse<ShopifyNodesResponse>;
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  if (json.errors) throw new Error("Shopify GraphQL errors");

  const lookup: Record<string, ShopifyFieldReferenceNode> = {};
  for (const node of json.data?.nodes || []) {
    const mapped = mapNodeToReference(node);
    if (mapped?.id) {
      lookup[mapped.id] = mapped;
    }
  }
  return lookup;
}

export function hydrateShopifyFieldsWithResolvedReferences(
  fields: ShopifyMetaobjectField[] | null | undefined,
  lookup: Record<string, ShopifyFieldReferenceNode>,
): ShopifyMetaobjectField[] {
  return (fields || []).map((field) => {
    const rawValue = fieldValue(field);
    if (!rawValue || !isShopifyGid(rawValue)) return field;
    if (field?.reference || (field?.references?.nodes || []).some(Boolean)) return field;
    const resolvedReference = lookup[rawValue];
    if (!resolvedReference) return field;
    return {
      ...field,
      reference: resolvedReference,
    };
  });
}

export function hydrateArtistMetaobjectWithResolvedReferences(
  metaobject: ShopifyArtistMetaobjectNode,
  lookup: Record<string, ShopifyFieldReferenceNode>,
): ShopifyArtistMetaobjectNode {
  return {
    ...metaobject,
    fields: hydrateShopifyFieldsWithResolvedReferences(metaobject.fields, lookup),
  };
}
