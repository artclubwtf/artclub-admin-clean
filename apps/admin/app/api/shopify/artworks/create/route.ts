import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { ArtistModel } from "@/models/Artist";
import { downloadFromS3 } from "@/lib/s3";
import { createDraftArtworkProduct } from "@/lib/shopifyArtworks";

const saleModes = ["PRINT_ONLY", "ORIGINAL_ONLY", "ORIGINAL_AND_PRINTS"] as const;
type SaleMode = (typeof saleModes)[number];

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

type AiWorkerConfig = {
  shop: string;
  limit: number;
  key: string;
};

type AiAutomationStepStatus = "pending" | "ok" | "error";
type AiAutomationStatus = {
  productsWorker: AiAutomationStepStatus;
  tagsWorker: AiAutomationStepStatus;
  tagUpdate: AiAutomationStepStatus;
  errors?: string[];
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
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

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    const downloadedImages = [];
    for (const doc of mediaDocs) {
      const downloaded = await downloadFromS3(doc.s3Key);
      if (!downloaded.body || downloaded.body.length === 0) {
        throw new Error(`Failed to download media: ${doc._id.toString()}`);
      }
      downloadedImages.push({
        buffer: downloaded.body,
        mimeType: doc.mimeType || downloaded.contentType || "application/octet-stream",
        filename: doc.filename || doc.s3Key,
      });
    }

    const offering = saleMode === "PRINT_ONLY" ? "print_only" : "original_plus_prints";
    const priceToSend = offering === "original_plus_prints" ? Number(priceRaw) : null;

    const product = await createDraftArtworkProduct({
      artistShopifyMetaobjectGid: artistMetaobjectGid,
      title,
      shortDescription: kurzbeschreibung || description || undefined,
      widthCm: widthParsed ?? null,
      heightCm: heightParsed ?? null,
      offering,
      originalPriceEur: priceToSend ?? undefined,
      images: downloadedImages,
    });

    const baseTags = product.tags || [];

    const aiAutomation: AiAutomationStatus = {
      productsWorker: "pending",
      tagsWorker: "pending",
      tagUpdate: "pending",
    };

    (async () => {
      const automationErrors: string[] = [];
      const recordAutomationError = (key: keyof Omit<AiAutomationStatus, "errors">, err: unknown) => {
        aiAutomation[key] = "error";
        const message = err instanceof Error ? err.message : "Unknown automation error";
        if (!automationErrors.includes(message)) {
          automationErrors.push(message);
        }
      };

      let workerConfig: AiWorkerConfig | null = null;
      try {
        workerConfig = resolveAiWorkerConfig();
      } catch (err) {
        recordAutomationError("productsWorker", err);
        recordAutomationError("tagsWorker", err);
      }

      await waitMs(60_000);

      try {
        await addAiReadyTag(product.productId, baseTags);
        aiAutomation.tagUpdate = "ok";
      } catch (err) {
        recordAutomationError("tagUpdate", err);
      }

      if (workerConfig) {
        try {
          const productsWorkerUrl = mustEnv("AI_WORKER_PRODUCTS_URL");
          await triggerWorker(productsWorkerUrl, workerConfig);
          aiAutomation.productsWorker = "ok";
        } catch (err) {
          recordAutomationError("productsWorker", err);
        }
      }

      await waitMs(60_000);

      if (workerConfig) {
        try {
          const tagsWorkerUrl = mustEnv("AI_WORKER_TAGS_URL");
          await triggerWorker(tagsWorkerUrl, workerConfig);
          aiAutomation.tagsWorker = "ok";
        } catch (err) {
          recordAutomationError("tagsWorker", err);
        }
      }

      if (automationErrors.length) {
        aiAutomation.errors = automationErrors;
      }
    })().catch((err) => {
      console.error("Background AI automation failed", err);
    });

    return NextResponse.json(
      {
        productGid: product.productId,
        title,
        status: "DRAFT",
        imageUrl: product.imageUrl ?? null,
        price: priceToSend ?? null,
        aiAutomation,
        adminUrl: product.adminUrl,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Failed to create artwork in Shopify", err);
    const message = err?.message || "Failed to create artwork";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
