import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { CanonicalProductModel } from "@/models/CanonicalProduct";
import { ShopifySyncJobModel } from "@/models/ShopifySyncJob";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim();
  const productId = url.searchParams.get("productId")?.trim();
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 50;

  await connectMongo();

  const query: Record<string, unknown> = {};
  if (status) query.status = status;
  if (productId) {
    query.$or = [
      ...(Types.ObjectId.isValid(productId) ? [{ canonicalProductId: new Types.ObjectId(productId) }] : []),
      { productKey: productId },
    ];
  }

  const jobs = await ShopifySyncJobModel.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const canonicalProductIds = jobs
    .map((job) => (job.canonicalProductId ? String(job.canonicalProductId) : ""))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .filter((value) => Types.ObjectId.isValid(value))
    .map((value) => new Types.ObjectId(value));

  const products = canonicalProductIds.length
    ? await CanonicalProductModel.find({ _id: { $in: canonicalProductIds } })
        .select({ _id: 1, title: 1, productKey: 1 })
        .lean()
    : [];
  const productById = new Map(products.map((product) => [String(product._id), product]));

  return NextResponse.json(
    {
      ok: true,
      items: jobs.map((job) => {
        const product = job.canonicalProductId ? productById.get(String(job.canonicalProductId)) : null;
        return {
          id: String(job._id),
          type: job.type,
          status: job.status,
          priority: job.priority,
          productKey: job.productKey || product?.productKey || null,
          canonicalProductId: job.canonicalProductId ? String(job.canonicalProductId) : null,
          productTitle: product?.title || null,
          canonicalArtistId: job.canonicalArtistId ? String(job.canonicalArtistId) : null,
          artistKey: job.artistKey || null,
          reason: job.reason || null,
          attempts: job.attempts || 0,
          maxAttempts: job.maxAttempts || 5,
          nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : null,
          lockedAt: job.lockedAt ? new Date(job.lockedAt).toISOString() : null,
          lastError: job.lastError || null,
          lastUserErrors: job.lastUserErrors || null,
          lastGraphqlErrors: job.lastGraphqlErrors || null,
          createdAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
          updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
          finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
        };
      }),
    },
    { status: 200 },
  );
}
