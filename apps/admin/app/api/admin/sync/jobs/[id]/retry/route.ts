import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ShopifySyncJobModel } from "@/models/ShopifySyncJob";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: false, error: "invalid_job_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { reset?: boolean } | null;

  await connectMongo();

  const setPayload: Record<string, unknown> = {
    status: "queued",
    nextRunAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    finishedAt: null,
    lastError: null,
    lastUserErrors: null,
    lastGraphqlErrors: null,
  };
  if (body?.reset) {
    setPayload.attempts = 0;
  }

  const updated = await ShopifySyncJobModel.findOneAndUpdate(
    {
      _id: id,
      status: { $in: ["failed", "retry_scheduled"] },
    },
    {
      $set: setPayload,
    },
    { new: true },
  ).lean();

  if (!updated?._id) {
    return NextResponse.json({ ok: false, error: "job_not_retryable" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      job: {
        id: String(updated._id),
        status: updated.status,
        attempts: updated.attempts || 0,
        nextRunAt: updated.nextRunAt ? new Date(updated.nextRunAt).toISOString() : null,
      },
    },
    { status: 200 },
  );
}
