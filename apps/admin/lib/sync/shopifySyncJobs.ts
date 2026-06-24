import { CanonicalArtistModel } from "../../models/CanonicalArtist";
import { CanonicalProductModel } from "../../models/CanonicalProduct";
import {
  ShopifySyncJobModel,
  type ShopifySyncJob,
  type ShopifySyncJobStatus,
  type ShopifySyncJobType,
} from "../../models/ShopifySyncJob";

type ShopifySyncJobRecord = ShopifySyncJob & { _id: unknown };

const ACTIVE_JOB_STATUSES: ShopifySyncJobStatus[] = ["queued", "processing", "retry_scheduled"];

function envFlagEnabled(name: string) {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envNumber(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function isShopifySyncInlineEnabled() {
  return envFlagEnabled("SHOPIFY_SYNC_INLINE");
}

export function getShopifySyncWorkerBatchSize() {
  return envNumber("SHOPIFY_SYNC_WORKER_BATCH_SIZE", 3);
}

export function getShopifySyncWorkerDelayMs() {
  return envNumber("SHOPIFY_SYNC_WORKER_DELAY_MS", 1500);
}

export function getShopifySyncWorkerIdleMs() {
  return envNumber("SHOPIFY_SYNC_WORKER_IDLE_MS", 10000);
}

async function findExistingActiveJob(filter: {
  type: ShopifySyncJobType;
  canonicalProductId?: string | null;
  canonicalArtistId?: string | null;
  productKey?: string | null;
  artistKey?: string | null;
}) {
  return ShopifySyncJobModel.findOne({
    type: filter.type,
    status: { $in: ACTIVE_JOB_STATUSES },
    ...(filter.canonicalProductId ? { canonicalProductId: filter.canonicalProductId } : {}),
    ...(filter.canonicalArtistId ? { canonicalArtistId: filter.canonicalArtistId } : {}),
    ...(filter.productKey ? { productKey: filter.productKey } : {}),
    ...(filter.artistKey ? { artistKey: filter.artistKey } : {}),
  })
    .sort({ createdAt: -1 })
    .lean();
}

export async function enqueueShopifySyncJob(input: {
  type: ShopifySyncJobType;
  priority?: number;
  canonicalProductId?: string | null;
  canonicalArtistId?: string | null;
  productKey?: string | null;
  artistKey?: string | null;
  reason?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  nextRunAt?: Date;
}) {
  const existing = (await findExistingActiveJob(input)) as ShopifySyncJobRecord | null;
  if (existing?._id) return existing;

  const created = await ShopifySyncJobModel.create({
    type: input.type,
    status: "queued",
    priority: input.priority ?? 100,
    canonicalProductId: input.canonicalProductId || undefined,
    canonicalArtistId: input.canonicalArtistId || undefined,
    productKey: input.productKey || undefined,
    artistKey: input.artistKey || undefined,
    reason: input.reason || undefined,
    payload: input.payload || undefined,
    maxAttempts: input.maxAttempts ?? 5,
    nextRunAt: input.nextRunAt || new Date(),
  });

  return created.toObject() as ShopifySyncJobRecord;
}

export async function queueProductPushJob(input: {
  canonicalProductId: string;
  shopDomain: string;
  productKey: string;
  reason?: string;
  payload?: Record<string, unknown>;
}) {
  const job = await enqueueShopifySyncJob({
    type: "product_push",
    priority: 120,
    canonicalProductId: input.canonicalProductId,
    productKey: input.productKey,
    reason: input.reason || "product_changed",
    payload: {
      shopDomain: input.shopDomain,
      ...(input.payload || {}),
    },
  });

  await CanonicalProductModel.updateOne(
    { _id: input.canonicalProductId, shopDomain: input.shopDomain, productKey: input.productKey },
    {
      $set: {
        "sync.status": "queued",
        "sync.needsPush": true,
        "sync.lastJobId": String(job._id),
        "sync.lastError": null,
      },
    },
  );

  return job;
}

export async function queueInventorySyncJob(input: {
  canonicalProductId: string;
  shopDomain: string;
  productKey: string;
  reason?: string;
  payload?: Record<string, unknown>;
  nextRunAt?: Date;
}) {
  const job = await enqueueShopifySyncJob({
    type: "inventory_sync",
    priority: 110,
    canonicalProductId: input.canonicalProductId,
    productKey: input.productKey,
    reason: input.reason || "inventory_sync_required",
    payload: {
      shopDomain: input.shopDomain,
      ...(input.payload || {}),
    },
    nextRunAt: input.nextRunAt,
  });

  await CanonicalProductModel.updateOne(
    { _id: input.canonicalProductId, shopDomain: input.shopDomain, productKey: input.productKey },
    {
      $set: {
        "sync.inventoryStatus": "queued",
        "sync.lastJobId": String(job._id),
      },
    },
  );

  return job;
}

export async function queueArtistPushJob(input: {
  canonicalArtistId: string;
  shopDomain: string;
  artistKey: string;
  reason?: string;
  payload?: Record<string, unknown>;
}) {
  const job = await enqueueShopifySyncJob({
    type: "artist_push",
    priority: 90,
    canonicalArtistId: input.canonicalArtistId,
    artistKey: input.artistKey,
    reason: input.reason || "artist_changed",
    payload: {
      shopDomain: input.shopDomain,
      ...(input.payload || {}),
    },
  });

  await CanonicalArtistModel.updateOne(
    { _id: input.canonicalArtistId, shopDomain: input.shopDomain, artistKey: input.artistKey },
    {
      $set: {
        "sync.status": "queued",
        "sync.needsPush": true,
        "sync.lastError": null,
      },
    },
  );

  return job;
}
