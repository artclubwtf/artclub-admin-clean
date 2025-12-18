type ShopifyProduct = { id: string; title: string };
type ShopifyProductWithImage = ShopifyProduct & {
  handle: string;
  featuredImage: string | null;
};
type ShopifyMetaobjectField = { key: string; value: string | null };
type ShopifyMetaobjectNode = {
  id: string;
  handle: string;
  fields: ShopifyMetaobjectField[];
};
export type ShopifyKuenstler = ShopifyKuenstlerFields & {
  id: string;
  handle: string;
};
type ShopifyKuenstlerFields = {
  name: string | null;
  instagram: string | null;
  quote: string | null;
  einleitung_1: string | null;
  text_1: string | null;
  bilder: string | null;
  bild_1: string | null;
  bild_2: string | null;
  bild_3: string | null;
  kategorie: string | null;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const emptyKuenstlerFields: ShopifyKuenstlerFields = {
  name: null,
  instagram: null,
  quote: null,
  einleitung_1: null,
  text_1: null,
  bilder: null,
  bild_1: null,
  bild_2: null,
  bild_3: null,
  kategorie: null,
};

function mapKuenstlerFields(fields: ShopifyMetaobjectField[]): ShopifyKuenstlerFields {
  return fields.reduce((acc, field) => {
    if (field.key in acc) {
      acc[field.key as keyof ShopifyKuenstlerFields] = field.value;
    }
    return acc;
  }, { ...emptyKuenstlerFields });
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

export async function fetchKuenstler(first = 50): Promise<ShopifyKuenstler[]> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";

  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const query = `
    query Kuenstler($first: Int!) {
      metaobjects(type: "kunstler", first: $first) {
        edges {
          node {
            id
            handle
            fields {
              key
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
    body: JSON.stringify({ query, variables: { first } }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);

  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const edges: { node: ShopifyMetaobjectNode }[] = json.data?.metaobjects?.edges ?? [];
  return edges.map(({ node }) => ({
    id: node.id,
    handle: node.handle,
    ...mapKuenstlerFields(node.fields || []),
  }));
}

export async function fetchKuenstlerById(id: string): Promise<ShopifyKuenstler | null> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";

  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const query = `
    query KuenstlerById($id: ID!) {
      metaobject(id: $id) {
        id
        handle
        fields {
          key
          value
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
    body: JSON.stringify({ query, variables: { id } }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);

  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const node: ShopifyMetaobjectNode | null = json.data?.metaobject ?? null;
  if (!node) return null;
  return {
    id: node.id,
    handle: node.handle,
    ...mapKuenstlerFields(node.fields || []),
  };
}

type KuenstlerUpdatePatch = Partial<
  Pick<ShopifyKuenstlerFields, "name" | "instagram" | "quote" | "einleitung_1" | "text_1">
>;

export async function updateKuenstler(id: string, patch: KuenstlerUpdatePatch): Promise<ShopifyKuenstler> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";

  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const fields = Object.entries(patch)
    .filter(([key, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value: value === null ? "" : String(value),
    }));

  const mutation = `
    mutation UpdateKuenstler($id: ID!, $fields: [MetaobjectFieldInput!]!) {
      metaobjectUpdate(id: $id, metaobject: { fields: $fields }) {
        metaobject {
          id
          handle
          fields {
            key
            value
          }
        }
        userErrors {
          field
          message
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
    body: JSON.stringify({ query: mutation, variables: { id, fields } }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);

  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const userErrors = json.data?.metaobjectUpdate?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(`Shopify metaobjectUpdate errors: ${JSON.stringify(userErrors)}`);
  }

  const node: ShopifyMetaobjectNode | null = json.data?.metaobjectUpdate?.metaobject ?? null;
  if (!node) {
    throw new Error("Shopify metaobjectUpdate returned no metaobject");
  }

  return {
    id: node.id,
    handle: node.handle,
    ...mapKuenstlerFields(node.fields || []),
  };
}

export async function fetchProductsByCollectionId(
  collectionGid: string,
  first = 50,
): Promise<ShopifyProductWithImage[]> {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";

  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const query = `
    query CollectionProducts($id: ID!, $first: Int!) {
      collection(id: $id) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
              }
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
    body: JSON.stringify({ query, variables: { id: collectionGid, first } }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);

  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const edges: { node: any }[] = json.data?.collection?.products?.edges ?? [];
  return edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    featuredImage: node.featuredImage?.url ?? null,
  }));
}
