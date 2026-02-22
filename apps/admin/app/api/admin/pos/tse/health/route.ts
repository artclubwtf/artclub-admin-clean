import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getTSEHealth } from "@/lib/pos/tse";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    await connectMongo();
    const health = await getTSEHealth();
    return NextResponse.json({ ok: Boolean(health.ok), provider: health.provider, env: health.env ?? null }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "tse_health_failed";
    return NextResponse.json(
      {
        ok: false,
        provider: process.env.POS_TSE_PROVIDER?.trim().toLowerCase() || "noop",
        env: process.env.FISKALY_ENV?.trim().toLowerCase() || null,
        error: message,
      },
      { status: 500 },
    );
  }
}
