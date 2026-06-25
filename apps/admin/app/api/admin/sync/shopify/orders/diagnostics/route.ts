import { NextResponse } from "next/server";

import { getShopifyOrdersDiagnostics } from "@/lib/shopifyOrderBackfill";
import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit") || 20);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 20;
  const since = searchParams.get("since") || undefined;
  const until = searchParams.get("until") || undefined;

  await connectMongo();

  const diagnostics = await getShopifyOrdersDiagnostics({ limit, since, until });
  return NextResponse.json({ ok: true, ...diagnostics }, { status: 200 });
}
