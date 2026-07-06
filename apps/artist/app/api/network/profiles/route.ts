import { networkProfileTypes } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { listUnifiedProfiles } from "@/lib/server/unified-profile";
export async function GET(req: Request) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const url = new URL(req.url); const type = url.searchParams.get("type") || "";
  const profiles = await listUnifiedProfiles({ q: (url.searchParams.get("q") || "").trim().slice(0, 100), type: networkProfileTypes.includes(type as any) ? type : undefined, city: (url.searchParams.get("city") || "").trim().slice(0, 100), country: (url.searchParams.get("country") || "").trim().slice(0, 100), excludeUserId: auth.context.user._id });
  return Response.json({ ok: true, profiles });
}
