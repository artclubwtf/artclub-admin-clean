import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, connectionState, notify } from "@/lib/server/network-service";
import { materializeUnifiedProfile } from "@/lib/server/unified-profile";
import { NetworkProfileLikeModel } from "@/lib/server/models";

export async function POST(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { slug } = await params; const target = await materializeUnifiedProfile(decodeURIComponent(slug));
  if (!target) return apiError("profile_not_found", 404);
  if (String(target._id) === String(auth.context.profile._id)) return apiError("cannot_like_self", 409);
  if ((await connectionState(auth.context.profile._id, target._id))?.status === "blocked") return apiError("profile_blocked", 403);
  await NetworkProfileLikeModel.updateOne({ likerProfileId: auth.context.profile._id, likedProfileId: target._id }, { $setOnInsert: { likerProfileId: auth.context.profile._id, likedProfileId: target._id } }, { upsert: true });
  await notify({ recipientProfileId: target._id, actorProfileId: auth.context.profile._id, type: "profile_like", targetType: "profile", targetId: target._id });
  return Response.json({ ok: true, liked: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { slug } = await params; const target = await materializeUnifiedProfile(decodeURIComponent(slug));
  if (!target) return apiError("profile_not_found", 404);
  await NetworkProfileLikeModel.deleteOne({ likerProfileId: auth.context.profile._id, likedProfileId: target._id });
  return Response.json({ ok: true, liked: false });
}
