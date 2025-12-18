type ShopifyProduct = { id: string; title: string };
type ShopifyProductWithImage = ShopifyProduct & {
  handle: string;
  featuredImage: string | null;
  artistMetaobject?: ShopifyKuenstler | null;
  legacyArtistUrl?: string | null;
  kurzbeschreibung?: string | null;
  widthCm?: string | null;
  heightCm?: string | null;
};
type ShopifyMetaobjectField = { key: string; value: string | null };
type ShopifyMetaobjectNode = {
  id: string;
  handle: string;
  fields: ShopifyMetaobjectField[];
};

export const SHOPIFY_METAOBJECT_TYPE_KUENSTLER = "kuenstler" as const;

export const KUENSTLER_FIELD_KEYS = {
  bilder: "bilder",
  bild_1: "bild_1",
  bild_2: "bild_2",
  bild_3: "bild_3",
  instagram: "instagram",
  name: "name",
  quote: "quote",
  einleitung_1: "einleitung_1",
  text_1: "text_1",
  kategorie: "kategorie",
} as const;

export const SHOPIFY_PRODUCT_NAMESPACE_CUSTOM = "custom";
export const PRODUCT_METAFIELD_KEYS = {
  artistMetaobject: "kunstler",
  artistLegacyUrl: "kuenstler",
  kurzbeschreibung: "kurzbeschreibung",
  height: "height",
  width: "breite_cm_",
  views: "views",
} as const;

type ShopifyKuenstlerFields = {
  [KUENSTLER_FIELD_KEYS.name]: string | null;
  [KUENSTLER_FIELD_KEYS.instagram]: string | null;
  [KUENSTLER_FIELD_KEYS.quote]: string | null;
  [KUENSTLER_FIELD_KEYS.einleitung_1]: string | null;
  [KUENSTLER_FIELD_KEYS.text_1]: string | null;
  [KUENSTLER_FIELD_KEYS.bilder]: string | null;
  [KUENSTLER_FIELD_KEYS.bild_1]: string | null;
  [KUENSTLER_FIELD_KEYS.bild_2]: string | null;
  [KUENSTLER_FIELD_KEYS.bild_3]: string | null;
  [KUENSTLER_FIELD_KEYS.kategorie]: string | null;
};

export type ShopifyKuenstler = ShopifyKuenstlerFields & {
  id: string;
  handle: string;
};

type MetaobjectFieldInput = { key: string; value: string };
export type ShopifyProductMetafieldInput = { namespace: string; key: string; type: string; value: string };

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const emptyKuenstlerFields: ShopifyKuenstlerFields = {
  [KUENSTLER_FIELD_KEYS.name]: null,
  [KUENSTLER_FIELD_KEYS.instagram]: null,
  [KUENSTLER_FIELD_KEYS.quote]: null,
  [KUENSTLER_FIELD_KEYS.einleitung_1]: null,
  [KUENSTLER_FIELD_KEYS.text_1]: null,
  [KUENSTLER_FIELD_KEYS.bilder]: null,
  [KUENSTLER_FIELD_KEYS.bild_1]: null,
  [KUENSTLER_FIELD_KEYS.bild_2]: null,
  [KUENSTLER_FIELD_KEYS.bild_3]: null,
  [KUENSTLER_FIELD_KEYS.kategorie]: null,
};

function mapKuenstlerFields(fields: ShopifyMetaobjectField[]): ShopifyKuenstlerFields {
  return fields.reduce((acc, field) => {
    if (field.key in acc) {
      acc[field.key as keyof ShopifyKuenstlerFields] = field.value || null;
    }
    return acc;
  }, { ...emptyKuenstlerFields });
}

export function buildArtistMetaobjectFieldsFromForm(input: Partial<ShopifyKuenstlerFields>): MetaobjectFieldInput[] {
  return (Object.keys(KUENSTLER_FIELD_KEYS) as (keyof typeof KUENSTLER_FIELD_KEYS)[])
    .map((key) => {
      const value = input[KUENSTLER_FIELD_KEYS[key]];
      if (value === undefined || value === null) return null;
      const trimmed = String(value).trim();
      if (!trimmed) return null;
      return { key: KUENSTLER_FIELD_KEYS[key], value: trimmed };
    })
    .filter(Boolean) as MetaobjectFieldInput[];
}

type ProductMetafieldBuilderInput = {
  artistMetaobjectId?: string;
  legacyArtistUrl?: string;
  widthCm?: number | string | null;
  heightCm?: number | string | null;
  kurzbeschreibung?: string | null;
  views?: number | string | null;
  additional?: ShopifyProductMetafieldInput[];
};

export function buildProductMetafieldsForArtwork(input: ProductMetafieldBuilderInput): ShopifyProductMetafieldInput[] {
  const metafields: ShopifyProductMetafieldInput[] = [];

  if (input.artistMetaobjectId) {
    metafields.push({
      namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
      key: PRODUCT_METAFIELD_KEYS.artistMetaobject,
      type: "metaobject_reference",
      value: input.artistMetaobjectId,
    });
  }

  if (!input.artistMetaobjectId && input.legacyArtistUrl) {
    metafields.push({
      namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
      key: PRODUCT_METAFIELD_KEYS.artistLegacyUrl,
      type: "url",
      value: input.legacyArtistUrl,
    });
  }

  const width = input.widthCm;
  if (width !== undefined && width !== null && `${width}`.trim() !== "") {
    metafields.push({
      namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
      key: PRODUCT_METAFIELD_KEYS.width,
      type: "number_decimal",
      value: String(width),
    });
  }

  const height = input.heightCm;
  if (height !== undefined && height !== null && `${height}`.trim() !== "") {
    metafields.push({
      namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
      key: PRODUCT_METAFIELD_KEYS.height,
      type: "number_decimal",
      value: String(height),
    });
  }

  if (input.kurzbeschreibung && input.kurzbeschreibung.trim()) {
    metafields.push({
      namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
      key: PRODUCT_METAFIELD_KEYS.kurzbeschreibung,
      type: "multi_line_text_field",
      value: input.kurzbeschreibung.trim(),
    });
  }

  if (input.views !== undefined && input.views !== null && `${input.views}`.trim() !== "") {
    metafields.push({
      namespace: SHOPIFY_PRODUCT_NAMESPACE_CUSTOM,
      key: PRODUCT_METAFIELD_KEYS.views,
      type: "number_integer",
      value: String(input.views),
    });
  }

  if (input.additional?.length) {
    metafields.push(...input.additional);
  }

  return metafields;
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
      metaobjects(type: "${SHOPIFY_METAOBJECT_TYPE_KUENSTLER}", first: $first) {
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

type KuenstlerUpdatePatch = Partial<ShopifyKuenstlerFields>;

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

type UpsertArtistMetaobjectInput = {
  metaobjectId?: string;
  handle?: string;
  fields: Partial<ShopifyKuenstlerFields>;
};

export async function upsertArtistMetaobject(input: UpsertArtistMetaobjectInput) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const derivedHandle = input.handle || slugify(input.fields.name ?? "");
  if (!derivedHandle) {
    throw new Error("Artist handle requires a name");
  }

  const fields = buildArtistMetaobjectFieldsFromForm(input.fields);
  if (fields.length === 0) {
    throw new Error("At least one metaobject field is required");
  }

  const mutation = `
    mutation UpsertArtist($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
      metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
        metaobject { id handle }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    handle: { type: SHOPIFY_METAOBJECT_TYPE_KUENSTLER, handle: derivedHandle },
    metaobject: {
      id: input.metaobjectId,
      type: SHOPIFY_METAOBJECT_TYPE_KUENSTLER,
      handle: derivedHandle,
      fields,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query: mutation, variables }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);
  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const payload = json.data?.metaobjectUpsert;
  if (!payload) throw new Error("Shopify metaobject upsert returned no result");
  const userErrors = payload.userErrors ?? [];
  if (userErrors.length) throw new Error(`Shopify metaobject upsert errors: ${JSON.stringify(userErrors)}`);

  const metaobject = payload.metaobject;
  if (!metaobject) throw new Error("Shopify metaobject upsert missing metaobject");
  return { id: metaobject.id as string, handle: metaobject.handle as string };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

type DraftArtworkInput = {
  title: string;
  images: { src: string }[];
  metafields: ShopifyProductMetafieldInput[];
  tags?: string[];
};

export async function createDraftArtworkProduct(input: DraftArtworkInput) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const mutation = `
    mutation CreateArtwork($input: ProductInput!) {
      productCreate(input: $input) {
        product { id handle status }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    input: {
      title: input.title,
      status: "DRAFT",
      images: input.images,
      metafields: input.metafields,
      tags: input.tags || [],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query: mutation, variables }),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${text}`);
  const json = JSON.parse(text) as any;
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);

  const payload = json.data?.productCreate;
  if (!payload) throw new Error("Shopify productCreate returned no payload");
  const userErrors = payload.userErrors ?? [];
  if (userErrors.length) throw new Error(`Shopify productCreate errors: ${JSON.stringify(userErrors)}`);
  const product = payload.product;
  if (!product) throw new Error("Shopify productCreate missing product");
  return { id: product.id as string, handle: product.handle as string, status: product.status as string };
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
              metafieldKunstler: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistMetaobject}") {
                reference {
                  ... on Metaobject {
                    id
                    handle
                    fields {
                      key
                      value
                    }
                  }
                }
              }
              metafieldLegacyKuenstler: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.artistLegacyUrl}") {
                value
              }
              metafieldKurzbeschreibung: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.kurzbeschreibung}") {
                value
              }
              metafieldWidth: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.width}") {
                value
              }
              metafieldHeight: metafield(namespace: "${SHOPIFY_PRODUCT_NAMESPACE_CUSTOM}", key: "${PRODUCT_METAFIELD_KEYS.height}") {
                value
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
  return edges.map(({ node }) => {
    const artistNode = node.metafieldKunstler?.reference;
    const artistMetaobject = artistNode
      ? {
          id: artistNode.id,
          handle: artistNode.handle,
          ...mapKuenstlerFields(artistNode.fields || []),
        }
      : null;

    return {
      id: node.id,
      title: node.title,
      handle: node.handle,
      featuredImage: node.featuredImage?.url ?? null,
      artistMetaobject,
      legacyArtistUrl: node.metafieldLegacyKuenstler?.value ?? null,
      kurzbeschreibung: node.metafieldKurzbeschreibung?.value ?? null,
      widthCm: node.metafieldWidth?.value ?? null,
      heightCm: node.metafieldHeight?.value ?? null,
    };
  });
}
