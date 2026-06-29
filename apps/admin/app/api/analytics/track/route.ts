import { NextResponse } from "next/server";

import { buildAnalyticsCorsHeaders, ingestAnalyticsEvent } from "@/lib/artistAnalytics";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildAnalyticsCorsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  try {
    const result = await ingestAnalyticsEvent(req);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    console.error("Failed to ingest artist analytics event", error);
    return NextResponse.json(
      { ok: false, error: "analytics_ingest_failed" },
      {
        status: 500,
        headers: buildAnalyticsCorsHeaders(req.headers.get("origin")),
      },
    );
  }
}
