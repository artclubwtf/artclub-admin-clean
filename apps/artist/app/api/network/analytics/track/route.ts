import { createHash, randomUUID } from "node:crypto";
import { networkAnalyticsInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, validId } from "@/lib/server/network-service";
import { AnalyticsEventModel } from "@/lib/server/models";

function cookie(req: Request, name: string) { const raw = req.headers.get("cookie") || ""; return raw.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1); }
export async function POST(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const parsed = networkAnalyticsInputSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return apiError("invalid_analytics_event", 400, parsed.error.flatten());
  const visitor = cookie(req, "ac_vid") || auth.context.sessionUserId; const sessionId = (req.headers.get("x-artclub-session") || randomUUID()).slice(0, 128); const salt = process.env.NEXTAUTH_SECRET || "artclub-network";
  const visitorIdHash = createHash("sha256").update(`${salt}:${visitor}`).digest("hex");
  const idFields: Record<string, unknown> = {}; for (const key of ["targetProfileId", "canonicalArtistId", "canonicalProductId", "postId", "eventId"] as const) if (parsed.data[key] && validId(parsed.data[key])) idFields[key] = parsed.data[key];
  await AnalyticsEventModel.create({ ...parsed.data, ...idFields, userId: auth.context.user._id, profileId: auth.context.profile._id, sessionId, visitorIdHash, resolutionStatus: "matched", createdAt: new Date(), deviceCategory: /mobile|android|iphone/i.test(req.headers.get("user-agent") || "") ? "mobile" : "desktop" });
  return new Response(null, { status: 204 });
}
