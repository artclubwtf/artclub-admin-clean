import { buildProductMetafieldsForArtwork } from "@/lib/shopify";

type StagedUploadTarget = {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
};

type CreatedProduct = {
  id: string;
  handle: string;
  status: string;
  title: string;
  defaultVariantId?: string | null;
  defaultInventoryItemId?: string | null;
};

type DraftArtworkImage = {
  buffer?: Buffer;
  url?: string;
  mimeType?: string;
  filename?: string;
};

export type CreateDraftArtworkProductInput = {
  artistShopifyMetaobjectGid: string;
  title: string;
  shortDescription?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  offering: "print_only" | "original_plus_prints";
  originalPriceEur?: number | null;
  images: DraftArtworkImage[];
};

export type CreateDraftArtworkProductResult = {
  productId: string;
  productHandle?: string;
  adminUrl: string | null;
  imageUrl?: string | null;
  tags: string[];
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
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

function sanitizeFilename(name: string | undefined, mimeType: string) {
  const fallbackExt = mimeType.split("/")[1] || "img";
  const base = (name || "upload").trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  return base.includes(".") ? base : `${base}.${fallbackExt}`;
}

async function callShopifyAdmin(query: string, variables: any) {
  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const version = process.env.SHOPIFY_API_VERSION || "2024-10";
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

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
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }

  const json = JSON.parse(text) as any;
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data as any;
}

async function createStagedUpload(filename: string, mimeType: string, fileSize: number): Promise<StagedUploadTarget> {
  const mutation = `
    mutation StagedUploads($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    input: [
      {
        resource: "IMAGE",
        filename,
        mimeType,
        fileSize: String(fileSize),
        httpMethod: "POST",
      },
    ],
  };

  const data = await callShopifyAdmin(mutation, variables);
  const payload = data?.stagedUploadsCreate;
  if (!payload) throw new Error("Shopify stagedUploadsCreate returned no data");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "Staging upload failed";
    throw new Error(message);
  }

  const target = (payload.stagedTargets || [])[0] as StagedUploadTarget | undefined;
  if (!target?.url || !target?.resourceUrl) {
    throw new Error("Shopify staged upload target missing url");
  }

  return target;
}

async function uploadToShopifyStagedTarget(staged: StagedUploadTarget, buffer: Buffer, mimeType: string, filename: string) {
  const form = new FormData();
  for (const param of staged.parameters || []) {
    form.append(param.name, param.value);
  }
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  form.append("file", new Blob([arrayBuffer], { type: mimeType || "application/octet-stream" }), filename);

  const uploadRes = await fetch(staged.url, {
    method: "POST",
    body: form,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`Failed to upload file to Shopify storage (${uploadRes.status}): ${text || uploadRes.statusText}`);
  }
}

async function createProduct(input: any) {
  const mutation = `
    mutation CreateArtworkProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
          status
          title
          variants(first: 1) { nodes { id inventoryItem { id } } }
        }
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin(mutation, { input });
  const payload = data?.productCreate;
  if (!payload) throw new Error("Shopify productCreate returned no payload");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "productCreate failed";
    throw new Error(message);
  }
  const product = payload.product;
  if (!product?.id) throw new Error("Shopify productCreate missing product");
  const defaultVariantId = product?.variants?.nodes?.[0]?.id ?? null;
  const defaultInventoryItemId = product?.variants?.nodes?.[0]?.inventoryItem?.id ?? null;
  return {
    id: product.id as string,
    handle: product.handle as string,
    status: product.status as string,
    title: product.title as string,
    defaultVariantId,
    defaultInventoryItemId,
  } satisfies CreatedProduct;
}

async function attachMedia(productId: string, resourceUrls: string[]) {
  if (!resourceUrls.length) return { imageUrl: null as string | null };

  const mutation = `
    mutation AttachMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          mediaContentType
          status
          ... on MediaImage { image { url } }
        }
        mediaUserErrors { field message }
      }
    }
  `;

  const mediaInput = resourceUrls.map((url) => ({
    originalSource: url,
    mediaContentType: "IMAGE",
  }));

  const data = await callShopifyAdmin(mutation, { productId, media: mediaInput });
  const payload = data?.productCreateMedia;
  if (!payload) throw new Error("Shopify productCreateMedia returned no payload");
  const userErrors = payload.mediaUserErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "productCreateMedia failed";
    throw new Error(message);
  }

  const mediaNodes = (payload.media || []) as any[];
  const firstImage = mediaNodes.find((node) => node?.image?.url);
  return { imageUrl: firstImage?.image?.url ?? null };
}

let cachedLocationId: string | null = null;
async function getPrimaryLocationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;

  const envLocation = process.env.SHOPIFY_PRIMARY_LOCATION_ID;
  if (envLocation) {
    cachedLocationId = envLocation;
    return envLocation;
  }

  const query = `
    query FetchPrimaryLocation {
      locations(first: 1) {
        nodes { id name }
      }
    }
  `;

  const data = await callShopifyAdmin(query, {});
  const location = data?.locations?.nodes?.[0];
  if (!location?.id) {
    throw new Error("No Shopify locations available for inventory updates");
  }
  cachedLocationId = location.id as string;
  return cachedLocationId;
}

async function updateVariantPrice(productId: string, variantId: string, price: string | null) {
  const mutation = `
    mutation UpdateArtworkVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }
  `;

  const variantInput: Record<string, any> = { id: variantId };
  if (price !== null) {
    variantInput.price = price;
  }

  const data = await callShopifyAdmin(mutation, { productId, variants: [variantInput] });
  const payload = data?.productVariantsBulkUpdate;
  if (!payload) throw new Error("Shopify productVariantsBulkUpdate returned no payload");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "productVariantsBulkUpdate failed";
    throw new Error(message);
  }
}

async function setInventoryToOne(inventoryItemId: string, locationId: string) {
  const mutation = `
    mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin(mutation, {
    input: {
      name: "available",
      reason: "correction",
      changes: [
        {
          inventoryItemId,
          locationId,
          delta: 1,
        },
      ],
    },
  });

  const payload = data?.inventoryAdjustQuantities;
  if (!payload) throw new Error("Shopify inventoryAdjustQuantities returned no payload");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "inventoryAdjustQuantities failed";
    throw new Error(message);
  }
}

async function setInventoryTracking(inventoryItemId: string, tracked: boolean) {
  const mutation = `
    mutation UpdateInventoryTracking($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id tracked }
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin(mutation, { id: inventoryItemId, input: { tracked } });
  const payload = data?.inventoryItemUpdate;
  if (!payload) throw new Error("Shopify inventoryItemUpdate returned no payload");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "inventoryItemUpdate failed";
    throw new Error(message);
  }
}

export async function createDraftArtworkProduct(
  input: CreateDraftArtworkProductInput,
): Promise<CreateDraftArtworkProductResult> {
  const {
    artistShopifyMetaobjectGid,
    title,
    shortDescription,
    widthCm,
    heightCm,
    offering,
    originalPriceEur,
    images,
  } = input;

  if (!artistShopifyMetaobjectGid) throw new Error("Artist metaobject id missing");
  if (!title || !title.trim()) throw new Error("Title is required");

  const baseTags = offering === "original_plus_prints" ? ["original"] : [];
  const price = offering === "original_plus_prints" ? originalPriceEur : null;

  const stagedResources: string[] = [];
  for (const img of images) {
    if (img.buffer) {
      const mimeType = img.mimeType || "application/octet-stream";
      const filename = sanitizeFilename(img.filename, mimeType);
      const staged = await createStagedUpload(filename, mimeType, img.buffer.length);
      await uploadToShopifyStagedTarget(staged, img.buffer, mimeType, filename);
      stagedResources.push(staged.resourceUrl);
    } else if (img.url) {
      stagedResources.push(img.url);
    }
  }

  const metafields = buildProductMetafieldsForArtwork({
    artistMetaobjectId: artistShopifyMetaobjectGid,
    widthCm: widthCm ?? undefined,
    heightCm: heightCm ?? undefined,
    kurzbeschreibung: shortDescription || undefined,
  });

  const productInput: any = {
    title,
    status: "DRAFT",
    tags: [...baseTags],
    metafields,
  };

  const product = await createProduct(productInput);

  if (!product.defaultVariantId) {
    throw new Error("Shopify productCreate missing default variant");
  }
  if (!product.defaultInventoryItemId) {
    throw new Error("Shopify productCreate missing default inventory item");
  }

  const locationId = await getPrimaryLocationId();
  await setInventoryTracking(product.defaultInventoryItemId, true);

  if (price !== null && price !== undefined) {
    await updateVariantPrice(product.id, product.defaultVariantId, `${price}`);
  }

  await setInventoryToOne(product.defaultInventoryItemId, locationId);
  const mediaResult = await attachMedia(product.id, stagedResources);

  const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
  return {
    productId: product.id,
    productHandle: product.handle,
    adminUrl: buildShopifyAdminProductUrl(shop, product.id),
    imageUrl: mediaResult.imageUrl ?? null,
    tags: baseTags,
  };
}

export { buildShopifyAdminProductUrl };
