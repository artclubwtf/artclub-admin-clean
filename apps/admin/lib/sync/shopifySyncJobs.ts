import { CanonicalArtistModel } from "../../models/CanonicalArtist";
import { CanonicalProductModel } from "../../models/CanonicalProduct";
import {
  logAutoSync,
  logShopifyWorker,
} from "./syncLogger";
import {
  ShopifySyncJobModel,
  type ShopifySyncJob,
  type ShopifySyncJobStatus,
  type ShopifySyncJobType,
} from "../../models/ShopifySyncJob";

type ShopifySyncJobRecord = ShopifySyncJob & { _id: unknown };

const ACTIVE_JOB_STATUSES: ShopifySyncJobStatus[] = ["queued", "processing", "retry_scheduled"];
const RUNNABLE_JOB_STATUSES: ShopifySyncJobStatus[] = ["queued", "retry_scheduled"];

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

function maskMongoHost(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.host ? `${url.protocol}//${url.host}` : null;
  } catch {
    const match = value.match(/@([^/?]+)/);
    if (match?.[1]) return `mongodb://***@${match[1]}`;
    return "mongodb://[masked]";
  }
}

export function getShopifySyncJobCollectionName() {
  return ShopifySyncJobModel.collection.collectionName;
}

export function getShopifySyncJobDbName() {
  return ShopifySyncJobModel.db?.db?.databaseName || null;
}

export function getMongoHostMasked() {
  return maskMongoHost((process.env.MONGODB_URI || "").trim());
}

export function buildRunnableJobQuery(now = new Date()) {
  return {
    status: { $in: RUNNABLE_JOB_STATUSES },
    $or: [{ nextRunAt: { $exists: false } }, { nextRunAt: null }, { nextRunAt: { $lte: now } }],
  };
}

export function formatShopifySyncJobForDiagnostics(job: ShopifySyncJobRecord | null | undefined) {
  if (!job?._id) return null;
  return {
    id: String(job._id),
    type: job.type,
    status: job.status,
    canonicalProductId: job.canonicalProductId ? String(job.canonicalProductId) : null,
    productKey: job.productKey || null,
    canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : null,
    attempts: job.attempts || 0,
    nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : null,
    lockedAt: job.lockedAt ? new Date(job.lockedAt).toISOString() : null,
    lastError: job.lastError || null,
    createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
  };
}

export async function getShopifySyncQueueDiagnostics() {
  const now = new Date();
  const runnableQuery = buildRunnableJobQuery(now);
  const [queuedCount, retryScheduledCount, processingCount, failedCount, succeededCount, nextRunnableCount, oldestQueuedJob, latestJobs] =
    await Promise.all([
      ShopifySyncJobModel.countDocuments({ status: "queued" }),
      ShopifySyncJobModel.countDocuments({ status: "retry_scheduled" }),
      ShopifySyncJobModel.countDocuments({ status: "processing" }),
      ShopifySyncJobModel.countDocuments({ status: "failed" }),
      ShopifySyncJobModel.countDocuments({ status: "succeeded" }),
      ShopifySyncJobModel.countDocuments(runnableQuery),
      ShopifySyncJobModel.findOne({ status: "queued" }).sort({ createdAt: 1 }).lean(),
      ShopifySyncJobModel.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

  return {
    dbName: getShopifySyncJobDbName(),
    collectionName: getShopifySyncJobCollectionName(),
    counts: {
      queued: queuedCount,
      retry_scheduled: retryScheduledCount,
      processing: processingCount,
      failed: failedCount,
      succeeded: succeededCount,
    },
    nextRunnableCount,
    oldestQueuedJobId: oldestQueuedJob?._id ? String(oldestQueuedJob._id) : null,
    oldestQueuedNextRunAt: oldestQueuedJob?.nextRunAt ? new Date(oldestQueuedJob.nextRunAt).toISOString() : null,
    queryUsed: {
      statusIn: RUNNABLE_JOB_STATUSES,
      nextRunAt: "missing|null|<=now",
    },
    latestJobs: latestJobs.map((job) => formatShopifySyncJobForDiagnostics(job as ShopifySyncJobRecord)).filter(Boolean),
  };
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
  runId?: string;
  logScope?: "artist" | "worker";
}) {
  const existing = (await findExistingActiveJob(input)) as ShopifySyncJobRecord | null;
  if (existing?._id) return existing;

  const nextRunAt = input.nextRunAt || new Date();
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
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    nextRunAt,
  });

  const createdJob = created.toObject() as ShopifySyncJobRecord;
  const confirmed = await ShopifySyncJobModel.findById(created._id).lean();
  const logPayload = {
    jobId: String(created._id),
    type: createdJob.type,
    status: createdJob.status,
    canonicalProductId: createdJob.canonicalProductId ? String(createdJob.canonicalProductId) : null,
    productKey: createdJob.productKey || null,
    canonicalArtistId: createdJob.canonicalArtistId ? String(createdJob.canonicalArtistId) : null,
    nextRunAt: nextRunAt.toISOString(),
    collectionName: getShopifySyncJobCollectionName(),
    dbName: getShopifySyncJobDbName(),
  };

  if (input.logScope === "artist") {
    logAutoSync("artist_app_shopify_sync_job_created", logPayload, { runId: input.runId, force: true });
    logAutoSync(
      "artist_app_shopify_sync_job_confirmed_in_db",
      {
        jobId: String(created._id),
        found: Boolean(confirmed?._id),
        type: confirmed?.type || null,
        status: confirmed?.status || null,
        nextRunAt: confirmed?.nextRunAt ? new Date(confirmed.nextRunAt).toISOString() : null,
        canonicalProductId: confirmed?.canonicalProductId ? String(confirmed.canonicalProductId) : null,
        canonicalArtistId: confirmed?.canonicalArtistId ? String(confirmed.canonicalArtistId) : null,
        productKey: confirmed?.productKey || null,
        dbName: getShopifySyncJobDbName(),
        collectionName: getShopifySyncJobCollectionName(),
      },
      { runId: input.runId, force: true },
    );
  } else if (input.logScope === "worker") {
    logShopifyWorker("worker_job_created", logPayload, { runId: input.runId, force: true });
  }

  return createdJob;
}

export async function queueProductPushJob(input: {
  canonicalProductId: string;
  canonicalArtistId?: string | null;
  shopDomain: string;
  productKey: string;
  reason?: string;
  payload?: Record<string, unknown>;
  runId?: string;
}) {
  const job = await enqueueShopifySyncJob({
    type: "product_push",
    priority: 120,
    canonicalProductId: input.canonicalProductId,
    canonicalArtistId: input.canonicalArtistId || undefined,
    productKey: input.productKey,
    reason: input.reason || "product_changed",
    payload: {
      shopDomain: input.shopDomain,
      source: "artist_app",
      runId: input.runId,
      productKey: input.productKey,
      canonicalProductId: input.canonicalProductId,
      ...(input.canonicalArtistId ? { canonicalArtistId: input.canonicalArtistId } : {}),
      ...(input.payload || {}),
    },
    runId: input.runId,
    logScope: "artist",
  });

  await CanonicalProductModel.updateOne(
    { _id: input.canonicalProductId, shopDomain: input.shopDomain, productKey: input.productKey },
    {
      $set: {
        status: "shopify_pending",
        "sync.status": "queued",
        "sync.inventoryStatus": "pending",
        "sync.inventorySeedStatus": "pending",
        "sync.needsPush": true,
        "sync.needsInventorySeed": true,
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
  runId?: string;
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
    runId: input.runId,
  });

  await CanonicalProductModel.updateOne(
    { _id: input.canonicalProductId, shopDomain: input.shopDomain, productKey: input.productKey },
    {
      $set: {
        "sync.inventoryStatus": "queued",
        "sync.inventorySeedStatus": "queued",
        "sync.needsInventorySeed": true,
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
  runId?: string;
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
    runId: input.runId,
    logScope: "artist",
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
