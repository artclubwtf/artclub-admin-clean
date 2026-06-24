import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { runShopifySyncWorkerBatch } from "@/lib/sync/shopifySyncWorker";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function POST(req: Request) {
  const expectedSecret = (process.env.WORKER_SECRET || "").trim();
  const receivedSecret = (req.headers.get("x-worker-secret") || "").trim();

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return unauthorized();
  }

  const body = (await req.json().catch(() => null)) as { batchSize?: number; delayMs?: number } | null;

  await connectMongo();
  const result = await runShopifySyncWorkerBatch({
    ...(typeof body?.batchSize === "number" ? { batchSize: body.batchSize } : {}),
    ...(typeof body?.delayMs === "number" ? { delayMs: body.delayMs } : {}),
  });

  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
