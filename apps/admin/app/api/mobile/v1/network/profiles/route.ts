import { networkProfileTypes } from "@artclub/models";

import { mobileNetworkContext, serializeMobileProfile } from "@/lib/mobileNetwork";
import { NetworkProfileModel } from "@/models/Network";

export async function GET(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const url = new URL(req.url); const q = (url.searchParams.get("q") || "").trim().slice(0, 100); const type = url.searchParams.get("type") || ""; const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter: any = { userId: { $ne: auth.user._id }, isPublic: true, suspendedAt: { $exists: false } };
  if (networkProfileTypes.includes(type as any)) filter.profileType = type;
  if (escaped) filter.$or = [{ displayName: new RegExp(escaped, "i") }, { username: new RegExp(escaped, "i") }, { city: new RegExp(escaped, "i") }, { disciplines: new RegExp(escaped, "i") }, { interests: new RegExp(escaped, "i") }];
  const profiles = await NetworkProfileModel.find(filter).sort({ isVerified: -1, updatedAt: -1 }).limit(40).lean();
  return Response.json({ ok: true, profiles: profiles.map((profile) => ({ ...serializeMobileProfile(profile), reason: auth.profile!.city && profile.city?.toLowerCase() === auth.profile!.city.toLowerCase() ? profile.city : profile.disciplines?.find((item) => auth.profile!.disciplines?.includes(item)) || `Relevant ${profile.profileType.replaceAll("_", " ")}` })) });
}
