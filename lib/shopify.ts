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

type MetaobjectFieldInput = { key: string; value: string };

type UpsertArtistMetaobjectInput = {
  metaobjectId?: string;
  handle?: string;
  displayName: string;
  bio: string;
  instagram?: string;
  website?: string;
  location?: string;
  heroImageUrl?: string;
  internalStage?: string;
};

export async function upsertArtistMetaobject(input: UpsertArtistMetaobjectInput) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const metaobjectType = process.env.SHOPIFY_ARTIST_METAOBJECT_TYPE || "artist";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const fields: MetaobjectFieldInput[] = [
    { key: "handle", value: input.handle || slugify(input.displayName) },
    { key: "name", value: input.displayName },
    { key: "bio", value: input.bio },
  ];

  const optionalMap: [string, string | undefined][] = [
    ["instagram", input.instagram],
    ["website", input.website],
    ["location", input.location],
    ["hero_image_url", input.heroImageUrl],
    ["internal_stage", input.internalStage],
  ];

  optionalMap.forEach(([key, value]) => {
    if (value) fields.push({ key, value });
  });

  const mutation = `
    mutation UpsertArtist($type: String!, $handle: String!, $id: ID, $fields: [MetaobjectFieldInput!]!) {
      result: ${input.metaobjectId ? "metaobjectUpdate(id: $id, metaobject: { fields: $fields })" : "metaobjectCreate(metaobject: { type: $type, handle: $handle, fields: $fields })"} {
        metaobject {
          id
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables: any = {
    type: metaobjectType,
    handle: fields.find((f) => f.key === "handle")?.value,
    fields,
  };
  if (input.metaobjectId) variables.id = input.metaobjectId;

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

  const payload = json.data?.result;
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
  metafields: { namespace: string; key: string; type: string; value: string }[];
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
