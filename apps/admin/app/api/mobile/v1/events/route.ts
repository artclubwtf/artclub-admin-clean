import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { MobileEventModel } from "@/models/MobileEvent";

const allowedEvents = new Set(["view", "open_detail", "save", "react", "share", "poll_answer"]);

type IncomingEvent = {
  eventName?: string;
  productGid?: string;
  metadata?: Record<string, unknown>;
  ts?: number;
  sessionId?: string;
};

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateLimitOk(ip: string) {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimitOk(ip)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const user = await getMobileUserFromRequest(req);
    const body = (await req.json().catch(() => null)) as { events?: IncomingEvent[] } | null;
    const events = Array.isArray(body?.events) ? body?.events : [];

    if (!events.length) {
      return NextResponse.json({ ok: true, accepted: 0 }, { status: 200 });
    }

    const capped = events.slice(0, 200);
    const docs = capped
      .map((event) => {
        const eventName = typeof event.eventName === "string" ? event.eventName.trim() : "";
        if (!allowedEvents.has(eventName)) return null;
        const productGid = typeof event.productGid === "string" ? event.productGid.trim() : undefined;
        const sessionId = typeof event.sessionId === "string" ? event.sessionId.trim() : undefined;
        const createdAt =
          typeof event.ts === "number" && Number.isFinite(event.ts) ? new Date(event.ts) : new Date();
        return {
          userId: user?.id,
          sessionId,
          eventName,
          productGid,
          metadata: event.metadata ?? undefined,
          createdAt,
        };
      })
      .filter(Boolean);

    if (docs.length === 0) {
      return NextResponse.json({ ok: true, accepted: 0 }, { status: 200 });
    }

    await connectMongo();
    await MobileEventModel.insertMany(docs, { ordered: false });

    return NextResponse.json({ ok: true, accepted: docs.length }, { status: 200 });
  } catch (err) {
    console.error("Failed to ingest mobile events", err);
    const message = err instanceof Error ? err.message : "Failed to ingest events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
