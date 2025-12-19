import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { ArtistModel } from "@/models/Artist";
import { downloadFromS3 } from "@/lib/s3";
import { buildProductMetafieldsForArtwork } from "@/lib/shopify";

const saleModes = ["PRINT_ONLY", "ORIGINAL_ONLY", "ORIGINAL_AND_PRINTS"] as const;
type SaleMode = (typeof saleModes)[number];

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

type AiWorkerConfig = {
  shop: string;
  limit: number;
  key: string;
};

type AiAutomationStatus = {
  productsWorker: "ok" | "error";
  tagsWorker: "ok" | "error";
  tagUpdate: "ok" | "error";
  errors?: string[];
};

type CreateArtworkRequest = {
  artistId: string;
  artistMetaobjectGid: string;
  title: string;
  saleMode: SaleMode;
  price: string | null;
  editionSize?: string | null;
  kurzbeschreibung?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  description?: string | null;
  mediaIds: string[];
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function sanitizeFilename(name: string, mimeType: string) {
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

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function parseNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function resolveAiWorkerConfig(): AiWorkerConfig {
  const shop = mustEnv("AI_WORKER_SHOP");
  const limitRaw = mustEnv("AI_WORKER_LIMIT");
  const limit = Number(limitRaw);
  if (!Number.isFinite(limit)) {
    throw new Error("AI_WORKER_LIMIT must be a number");
  }
  const key = mustEnv("AI_WORKER_KEY");
  return { shop, limit, key };
}

async function triggerWorker(url: string, config: AiWorkerConfig): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop: config.shop, limit: config.limit, key: config.key }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Worker request failed (${res.status} ${res.statusText})`);
  }
}

async function addAiReadyTag(productId: string, baseTags: string[]): Promise<void> {
  const tags = Array.from(new Set([...(baseTags || []), "ai-ready"]));
  const mutation = `
    mutation UpdateArtworkTags($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `;

  const data = await callShopifyAdmin(mutation, { input: { id: productId, tags } });
  const payload = data?.productUpdate;
  if (!payload) throw new Error("Shopify productUpdate returned no payload");
  const userErrors = payload.userErrors || [];
  if (userErrors.length) {
    const message = userErrors.map((e: any) => e.message).join("; ") || "productUpdate failed";
    throw new Error(message);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Partial<CreateArtworkRequest> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const fieldErrors: Record<string, string> = {};
    const artistId = typeof body.artistId === "string" ? body.artistId.trim() : "";
    const artistMetaobjectGid = typeof body.artistMetaobjectGid === "string" ? body.artistMetaobjectGid.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const saleMode = body.saleMode as SaleMode | undefined;
    const priceRaw = body.price;
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const kurzbeschreibung = typeof body.kurzbeschreibung === "string" ? body.kurzbeschreibung.trim() : "";
    const mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.filter((id): id is string => typeof id === "string") : [];

    const widthParsed = parseNumber(body.widthCm);
    const heightParsed = parseNumber(body.heightCm);
    const editionParsed = parseNumber(body.editionSize);

    if (!artistId || !Types.ObjectId.isValid(artistId)) {
      fieldErrors.artistId = "artistId is required";
    }
    if (!artistMetaobjectGid) {
      fieldErrors.artistMetaobjectGid = "artistMetaobjectGid is required";
    }
    if (!title) {
      fieldErrors.title = "Title is required";
    }
    if (!saleMode || !saleModes.includes(saleMode)) {
      fieldErrors.saleMode = "saleMode is invalid";
    }
    const priceRequired = saleMode && saleMode !== "PRINT_ONLY";
    if (priceRequired && (priceRaw === undefined || priceRaw === null || `${priceRaw}`.trim() === "")) {
      fieldErrors.price = "Price is required for this sale mode";
    }
    if (priceRaw !== undefined && priceRaw !== null && `${priceRaw}`.trim() !== "" && Number.isNaN(Number(priceRaw))) {
      fieldErrors.price = "Price must be a number";
    }
    if (mediaIds.length === 0) {
      fieldErrors.mediaIds = "Select at least one media item";
    }
    const hasInvalidMediaId = mediaIds.some((id) => !Types.ObjectId.isValid(id));
    if (hasInvalidMediaId) {
      fieldErrors.mediaIds = "Invalid mediaIds";
    }
    if (widthParsed !== undefined && Number.isNaN(widthParsed)) {
      fieldErrors.widthCm = "Width must be a number";
    }
    if (heightParsed !== undefined && Number.isNaN(heightParsed)) {
      fieldErrors.heightCm = "Height must be a number";
    }
    if (editionParsed !== undefined && Number.isNaN(editionParsed)) {
      fieldErrors.editionSize = "Edition size must be a number";
    }

    if (Object.keys(fieldErrors).length) {
      return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 400 });
    }

    await connectMongo();
    const artist = await ArtistModel.findById(artistId).lean();
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }
    if (!artist.shopifySync?.metaobjectId || artist.shopifySync.metaobjectId !== artistMetaobjectGid) {
      return NextResponse.json({ error: "Artist is not linked to Shopify" }, { status: 400 });
    }

    const mediaObjectIds = mediaIds.map((id) => new Types.ObjectId(id));
    const mediaDocs = await MediaModel.find({
      _id: { $in: mediaObjectIds },
      artistId: new Types.ObjectId(artistId),
      kind: "artwork",
    })
      .sort({ createdAt: 1 })
      .lean();
    if (mediaDocs.length !== mediaIds.length) {
      return NextResponse.json({ error: "Some media files were not found or are not artwork kind" }, { status: 400 });
    }

    const stagedResources: string[] = [];
    for (const doc of mediaDocs) {
      const downloaded = await downloadFromS3(doc.s3Key);
      if (!downloaded.body || downloaded.body.length === 0) {
        throw new Error(`Failed to download media: ${doc._id.toString()}`);
      }
      const mimeType = doc.mimeType || downloaded.contentType || "application/octet-stream";
      const filename = sanitizeFilename(doc.filename || doc.s3Key, mimeType);

      const staged = await createStagedUpload(filename, mimeType, downloaded.body.length);
      await uploadToShopifyStagedTarget(staged, downloaded.body, mimeType, filename);
      stagedResources.push(staged.resourceUrl);
    }

    const priceToSend = saleMode === "PRINT_ONLY" ? null : priceRaw;
    const metafields = buildProductMetafieldsForArtwork({
      artistMetaobjectId: artistMetaobjectGid,
      widthCm: widthParsed ?? null,
      heightCm: heightParsed ?? null,
      kurzbeschreibung: kurzbeschreibung || null,
    });

    const baseTags = saleMode === "ORIGINAL_AND_PRINTS" ? ["original"] : [];
    const productInput: any = {
      title,
      status: "DRAFT",
      tags: [...baseTags],
      metafields,
    };

    if (description) {
      productInput.descriptionHtml = description;
    }

    const product = await createProduct(productInput);

    if (!product.defaultVariantId) {
      throw new Error("Shopify productCreate missing default variant");
    }
    if (!product.defaultInventoryItemId) {
      throw new Error("Shopify productCreate missing default inventory item");
    }

    const locationId = await getPrimaryLocationId();

    if (priceToSend !== null && priceToSend !== undefined && `${priceToSend}`.trim() !== "") {
      await updateVariantPrice(product.id, product.defaultVariantId, `${priceToSend}`.trim());
    }

    await setInventoryToOne(product.defaultInventoryItemId, locationId);

    const mediaResult = await attachMedia(product.id, stagedResources);

    // Allow Shopify to settle before kicking off automation
    await waitMs(60_000);

    const aiAutomationErrors: string[] = [];
    const aiAutomation: AiAutomationStatus = {
      productsWorker: "ok",
      tagsWorker: "ok",
      tagUpdate: "ok",
    };
    const recordAutomationError = (key: keyof Omit<AiAutomationStatus, "errors">, err: unknown) => {
      aiAutomation[key] = "error";
      const message = err instanceof Error ? err.message : "Unknown automation error";
      if (!aiAutomationErrors.includes(message)) {
        aiAutomationErrors.push(message);
      }
    };

    let workerConfig: AiWorkerConfig | null = null;
    try {
      workerConfig = resolveAiWorkerConfig();
    } catch (err) {
      recordAutomationError("productsWorker", err);
      recordAutomationError("tagsWorker", err);
    }

    if (workerConfig) {
      try {
        const productsWorkerUrl = mustEnv("AI_WORKER_PRODUCTS_URL");
        await triggerWorker(productsWorkerUrl, workerConfig);
      } catch (err) {
        recordAutomationError("productsWorker", err);
      }
    }

    try {
      await addAiReadyTag(product.id, baseTags);
    } catch (err) {
      recordAutomationError("tagUpdate", err);
    }

    if (workerConfig) {
      try {
        const tagsWorkerUrl = mustEnv("AI_WORKER_TAGS_URL");
        await triggerWorker(tagsWorkerUrl, workerConfig);
      } catch (err) {
        recordAutomationError("tagsWorker", err);
      }
    }

    if (aiAutomationErrors.length) {
      aiAutomation.errors = aiAutomationErrors;
    }

    return NextResponse.json(
      {
        productGid: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        imageUrl: mediaResult.imageUrl,
        price: priceToSend ?? null,
        aiAutomation,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Failed to create artwork in Shopify", err);
    const message = err?.message || "Failed to create artwork";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
