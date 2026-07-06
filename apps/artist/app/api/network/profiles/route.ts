import { networkProfileTypes } from "@artclub/models";
import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { NetworkProfileModel } from "@/lib/server/models";

export async function GET(req: Request) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const type = url.searchParams.get("type") || "";
  const city = (url.searchParams.get("city") || "").trim().slice(0, 100);
  const country = (url.searchParams.get("country") || "").trim().slice(0, 100);
  const filter: Record<string, unknown> = { isPublic: true, suspendedAt: { $exists: false }, _id: { $ne: auth.context.profile._id } };
  if (networkProfileTypes.includes(type as any)) filter.profileType = type;
  if (city) filter.city = new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (country) filter.country = new RegExp(country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ displayName: new RegExp(escaped, "i") }, { username: new RegExp(escaped, "i") }, { disciplines: new RegExp(escaped, "i") }, { interests: new RegExp(escaped, "i") }];
  }
  const profiles = await NetworkProfileModel.find(filter).sort({ isVerified: -1, updatedAt: -1 }).limit(40).lean();
  return Response.json({ ok: true, profiles: profiles.map(serializeNetworkProfile) });
}
