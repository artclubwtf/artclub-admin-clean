import { randomUUID } from "crypto";

import { connectMongo } from "../mongodb";
import { CanonicalArtistModel } from "../../models/CanonicalArtist";
import { CanonicalProductModel } from "../../models/CanonicalProduct";
import { ShopifySyncJobModel, type ShopifySyncJob } from "../../models/ShopifySyncJob";
import { syncProductInventoryToShopify } from "./shopifyInventory";
import {
  buildRunnableJobQuery,
  getMongoHostMasked,
  getShopifySyncJobCollectionName,
  getShopifySyncJobDbName,
  getShopifySyncQueueDiagnostics,
  getShopifySyncWorkerBatchSize,
  getShopifySyncWorkerDelayMs,
  getShopifySyncWorkerIdleMs,
} from "./shopifySyncJobs";
import { pushCanonicalProductToShopify, pushOneArtist, type PushResult } from "./shopifyPush";
import {
  createSyncRunId,
  extractErrorDetails,
  logShopifyWorker,
  logSyncError,
} from "./syncLogger";

type ShopifySyncJobRecord = ShopifySyncJob & { _id: unknown };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "shopify_sync_worker_failed";
}

function pushItemOutcome(result: PushResult, key: string) {
  const item = result.items.find((entry: PushResult["items"][number]) => entry.key === key) || result.items[0];
  if (!item) return { ok: result.failedCount === 0, status: "unknown", message: result.errors[0] || null };
  if (item.status === "created" || item.status === "updated") {
    return { ok: true, status: item.status, message: item.message };
  }
  if (item.status === "skipped" || item.status === "dry_run") {
    return { ok: true, status: item.status, message: item.message };
  }
  return { ok: false, status: item.status, message: item.message || result.errors[0] || "shopify_sync_failed" };
}

function nextRetryDate(attempt: number) {
  const delayMs = Math.min(60 * 60 * 1000, Math.max(60 * 1000, 2 ** Math.max(0, attempt - 1) * 60 * 1000));
  return new Date(Date.now() + delayMs);
}

function jobShopDomain(job: ShopifySyncJob) {
  const payloadShopDomain =
    job.payload && typeof job.payload === "object" && typeof (job.payload as Record<string, unknown>).shopDomain === "string"
      ? String((job.payload as Record<string, unknown>).shopDomain)
      : "";
  return payloadShopDomain.trim();
}

function jobContext(job: ShopifySyncJobRecord, workerId: string, runId: string) {
  return {
    workerId,
    runId,
    jobId: String(job._id),
    type: job.type,
    canonicalProductId: job.canonicalProductId ? String(job.canonicalProductId) : null,
    canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : null,
    productKey: job.productKey || null,
    artistKey: job.artistKey || null,
    attempts: (job.attempts || 0) + 1,
    origin: "worker_direct",
  };
}

async function lockNextJob(workerId: string) {
  const now = new Date();
  return ShopifySyncJobModel.findOneAndUpdate(
    {
      ...buildRunnableJobQuery(now),
    },
    {
      $set: {
        status: "processing",
        lockedAt: now,
        lockedBy: workerId,
        updatedAt: now,
      },
    },
    {
      new: true,
      sort: {
        priority: -1,
        nextRunAt: 1,
        createdAt: 1,
      },
    },
  ).lean() as Promise<ShopifySyncJobRecord | null>;
}

async function markJobSucceeded(job: ShopifySyncJobRecord, result: Record<string, unknown>) {
  await ShopifySyncJobModel.updateOne(
    { _id: job._id },
    {
      $set: {
        status: "succeeded",
        result,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        lastUserErrors: null,
        lastGraphqlErrors: null,
      },
    },
  );
}

async function scheduleRetry(job: ShopifySyncJobRecord, error: unknown, runId: string) {
  const details = extractErrorDetails(error) || {};
  const attempts = (job.attempts || 0) + 1;
  const nextRunAt = nextRetryDate(attempts);

  await ShopifySyncJobModel.updateOne(
    { _id: job._id },
    {
      $set: {
        status: "retry_scheduled",
        attempts,
        nextRunAt,
        lastError: errorMessage(error),
        lastUserErrors: details.userErrors || null,
        lastGraphqlErrors: details.graphqlErrors || null,
        lockedAt: null,
        lockedBy: null,
      },
    },
  );

  logShopifyWorker(
    "worker_job_retry_scheduled",
    {
      jobId: String(job._id),
      type: job.type,
      canonicalProductId: job.canonicalProductId ? String(job.canonicalProductId) : null,
      canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : null,
      productKey: job.productKey || null,
      attempts,
      origin: "worker_direct",
      nextRunAt: nextRunAt.toISOString(),
      errorMessage: errorMessage(error),
    },
    { runId, force: true },
  );
}

async function markJobFailed(job: ShopifySyncJobRecord, error: unknown, runId: string) {
  const details = extractErrorDetails(error) || {};
  const attempts = (job.attempts || 0) + 1;

  await ShopifySyncJobModel.updateOne(
    { _id: job._id },
    {
      $set: {
        status: "failed",
        attempts,
        lastError: errorMessage(error),
        lastUserErrors: details.userErrors || null,
        lastGraphqlErrors: details.graphqlErrors || null,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    },
  );

  const shopDomain = jobShopDomain(job);
  if (shopDomain && job.productKey) {
    await CanonicalProductModel.updateOne(
      { shopDomain, productKey: job.productKey },
      {
        $set: {
          "sync.lastError": errorMessage(error),
          ...(job.type === "inventory_sync"
            ? {
                "sync.inventoryStatus": "failed",
                "sync.status": "inventory_error",
              }
            : {
                "sync.status": "error",
              }),
        },
      },
    );
  }

  if (shopDomain && job.artistKey) {
    await CanonicalArtistModel.updateOne(
      { shopDomain, artistKey: job.artistKey },
      {
        $set: {
          "sync.lastError": errorMessage(error),
          "sync.status": "error",
        },
      },
    );
  }

  logShopifyWorker(
    "worker_job_failed",
    {
      jobId: String(job._id),
      type: job.type,
      canonicalProductId: job.canonicalProductId ? String(job.canonicalProductId) : null,
      canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : null,
      productKey: job.productKey || null,
      attempts,
      origin: "worker_direct",
      errorMessage: errorMessage(error),
    },
    { runId, force: true },
  );
}

async function processProductPushJob(job: ShopifySyncJobRecord, workerId: string, runId: string) {
  const shopDomain = jobShopDomain(job);
  if (!shopDomain || !job.productKey) {
    throw new Error("product_push_job_missing_context");
  }

  logShopifyWorker("worker_product_push_started", jobContext(job, workerId, runId), { runId, force: true });
  const pushResult = await pushCanonicalProductToShopify({
    shopDomain,
    productKey: job.productKey,
    runId,
    jobId: String(job._id),
    origin: "worker_direct",
    service: "worker",
  });
  const outcome = pushItemOutcome(pushResult, job.productKey);
  if (!outcome.ok) {
    throw new Error(outcome.message || "shopify_product_push_failed");
  }

  logShopifyWorker(
    "worker_product_push_done",
    {
      ...jobContext(job, workerId, runId),
      resultStatus: outcome.status,
      message: outcome.message || null,
    },
    { runId, force: true },
  );

  if (outcome.status === "skipped" || outcome.status === "dry_run") {
    return { productPush: outcome.status, message: outcome.message || null };
  }

  if (!job.canonicalProductId) {
    throw new Error("product_push_job_missing_canonical_product_id");
  }

  logShopifyWorker("worker_inventory_seed_started", jobContext(job, workerId, runId), { runId, force: true });
  const inventoryResult = await syncProductInventoryToShopify({
    shopDomain,
    productKey: job.productKey,
    runId,
    jobId: String(job._id),
    attempt: (job.attempts || 0) + 1,
    markProductSynced: true,
  });
  logShopifyWorker(
    "worker_inventory_seed_done",
    {
      ...jobContext(job, workerId, runId),
      ...inventoryResult,
    },
    { runId, force: true },
  );
  return {
    productPush: outcome.status,
    inventorySync: "seeded",
    ...inventoryResult,
  };
}

async function processInventorySyncJob(job: ShopifySyncJobRecord, workerId: string, runId: string) {
  const shopDomain = jobShopDomain(job);
  if (!shopDomain || !job.productKey) {
    throw new Error("inventory_sync_job_missing_context");
  }

  logShopifyWorker("worker_inventory_seed_started", jobContext(job, workerId, runId), { runId, force: true });
  const result = await syncProductInventoryToShopify({
    shopDomain,
    productKey: job.productKey,
    runId,
    jobId: String(job._id),
    attempt: (job.attempts || 0) + 1,
    markProductSynced: true,
  });
  logShopifyWorker(
    "worker_inventory_seed_done",
    {
      ...jobContext(job, workerId, runId),
      ...result,
    },
    { runId, force: true },
  );

  return {
    inventorySync: "seeded",
    ...result,
  };
}

async function processArtistPushJob(job: ShopifySyncJobRecord, workerId: string, runId: string) {
  const shopDomain = jobShopDomain(job);
  if (!shopDomain || !job.artistKey) {
    throw new Error("artist_push_job_missing_context");
  }

  const pushResult = await pushOneArtist({
    shopDomain,
    artistKey: job.artistKey,
    runId,
  });
  const outcome = pushItemOutcome(pushResult, job.artistKey);
  if (!outcome.ok) {
    throw new Error(outcome.message || "shopify_artist_push_failed");
  }

  return {
    artistPush: outcome.status,
    message: outcome.message || null,
  };
}

async function processJob(job: ShopifySyncJobRecord, workerId: string, runId: string) {
  if (job.type === "product_push") return processProductPushJob(job, workerId, runId);
  if (job.type === "inventory_sync") return processInventorySyncJob(job, workerId, runId);
  if (job.type === "artist_push") return processArtistPushJob(job, workerId, runId);
  return { skipped: true, reason: `unsupported_job_type:${job.type}` };
}

export async function runShopifySyncWorkerBatch(input?: {
  workerId?: string;
  batchSize?: number;
  delayMs?: number;
  runId?: string;
}) {
  const workerId = input?.workerId || `shopify-worker-${randomUUID()}`;
  const batchSize = input?.batchSize || getShopifySyncWorkerBatchSize();
  const delayMs = input?.delayMs ?? getShopifySyncWorkerDelayMs();
  const runId = input?.runId || createSyncRunId("shopify-worker");

  let lockedCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let retriedCount = 0;
  const processedJobIds: string[] = [];
  const diagnostics = await getShopifySyncQueueDiagnostics();

  logShopifyWorker(
    "worker_poll_started",
    {
      workerId,
      dbName: diagnostics.dbName,
      collectionName: diagnostics.collectionName,
      now: new Date().toISOString(),
      queuedCount: diagnostics.counts.queued,
      retryScheduledCount: diagnostics.counts.retry_scheduled,
      processingCount: diagnostics.counts.processing,
      failedCount: diagnostics.counts.failed,
      succeededCount: diagnostics.counts.succeeded,
      runnableCount: diagnostics.nextRunnableCount,
      latestJobs: diagnostics.latestJobs,
      queryUsed: diagnostics.queryUsed,
    },
    { runId, force: true },
  );

  for (let index = 0; index < batchSize; index += 1) {
    const job = await lockNextJob(workerId);
    if (!job?._id) break;

    lockedCount += 1;
    processedJobIds.push(String(job._id));

    logShopifyWorker(
      "worker_job_locked",
      {
        ...jobContext(job, workerId, runId),
      },
      { runId, force: true },
    );

    try {
      logShopifyWorker(
        "worker_job_started",
        jobContext(job, workerId, runId),
        { runId, force: true },
      );

      const result = await processJob(job, workerId, runId);
      await markJobSucceeded(job, result);
      succeededCount += 1;

      logShopifyWorker(
        "worker_job_succeeded",
        {
          ...jobContext(job, workerId, runId),
          result,
        },
        { runId, force: true },
      );
    } catch (error) {
      const attempts = (job.attempts || 0) + 1;
      if (attempts < (job.maxAttempts || 5)) {
        await scheduleRetry(job, error, runId);
        retriedCount += 1;
      } else {
        await markJobFailed(job, error, runId);
        failedCount += 1;
      }

      logSyncError(
        "shopify_worker_job_failed",
        error,
        {
          workerId,
          jobId: String(job._id),
          type: job.type,
          productKey: job.productKey || null,
          artistKey: job.artistKey || null,
        },
        { runId, force: true },
      );
    }

    if (index < batchSize - 1) {
      await sleep(delayMs);
    }
  }

  const summary = {
    workerId,
    runId,
    lockedCount,
    succeededCount,
    failedCount,
    retriedCount,
    processedJobIds,
  };

  if (lockedCount === 0) {
    logShopifyWorker(
      "worker_no_jobs_found",
      {
        queuedCount: diagnostics.counts.queued,
        runnableCount: diagnostics.nextRunnableCount,
        latestJobs: diagnostics.latestJobs,
      },
      { runId, force: true },
    );
  }

  logShopifyWorker("worker_batch_finished", summary, { runId, force: true });
  return summary;
}

export async function runShopifySyncWorkerLoop(input?: {
  workerId?: string;
  batchSize?: number;
  delayMs?: number;
  idleMs?: number;
  runOnce?: boolean;
}) {
  const workerId = input?.workerId || `shopify-worker-${randomUUID()}`;
  const batchSize = input?.batchSize || getShopifySyncWorkerBatchSize();
  const delayMs = input?.delayMs ?? getShopifySyncWorkerDelayMs();
  const idleMs = input?.idleMs ?? getShopifySyncWorkerIdleMs();
  const runOnce = input?.runOnce === true;
  const runId = createSyncRunId("shopify-worker");

  await connectMongo();

  logShopifyWorker(
    "worker_started",
    {
      mode: "direct",
      workerId,
      batchSize,
      delayMs,
      idleMs,
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      mongoDbName: getShopifySyncJobDbName(),
      mongoHostMasked: getMongoHostMasked(),
      jobCollectionName: getShopifySyncJobCollectionName(),
      hasShopifyToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
      hasLocationId: Boolean((process.env.SHOPIFY_ARTIST_STORAGE_LOCATION_ID || "").trim()),
    },
    { runId, force: true },
  );

  do {
    try {
      const result = await runShopifySyncWorkerBatch({
        workerId,
        batchSize,
        delayMs,
        runId,
      });

      if (runOnce) return result;
      if ((result.lockedCount || 0) === 0) {
        await sleep(idleMs);
      }
    } catch (error) {
      logSyncError(
        "shopify_worker_loop_failed",
        error,
        {
          workerId,
          mode: "direct",
        },
        { runId, force: true },
      );
      if (runOnce) throw error;
      await sleep(idleMs);
    }
  } while (true);
}

export {
  getMongoHostMasked,
  getShopifySyncJobCollectionName,
  getShopifySyncJobDbName,
} from "./shopifySyncJobs";
