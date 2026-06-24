import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  buildRunnableJobQuery,
  getShopifySyncJobCollectionName,
  getShopifySyncJobDbName,
  getShopifySyncQueueDiagnostics,
} from "@/lib/sync/shopifySyncJobs";
import { ShopifySyncJobModel } from "@/models/ShopifySyncJob";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  await connectMongo();

  const diagnostics = await getShopifySyncQueueDiagnostics();
  const nextRunnableJobs = await ShopifySyncJobModel.find(buildRunnableJobQuery())
    .sort({ priority: -1, nextRunAt: 1, createdAt: 1 })
    .limit(10)
    .lean();

  return NextResponse.json(
    {
      ok: true,
      dbName: getShopifySyncJobDbName(),
      collectionName: getShopifySyncJobCollectionName(),
      counts: diagnostics.counts,
      nextRunnableJobs: nextRunnableJobs.map((job) => ({
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
      })),
      latestJobs: diagnostics.latestJobs.map((job) => ({
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
      })),
    },
    { status: 200 },
  );
}
