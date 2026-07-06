import { networkPostInputSchema } from "@artclub/models";
import { Types } from "mongoose";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, cursorFilter, serializePost, validId } from "@/lib/server/network-service";
import { ConnectionModel, NetworkPostModel, PostLikeModel, SavedPostModel } from "@/lib/server/models";

export async function GET(req: Request) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const tab = url.searchParams.get("tab") === "connections" ? "connections" : "for-you";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const profileId = auth.context.profile._id;
  const filter: Record<string, unknown> = { ...cursorFilter(cursor), status: "published" };
  if (tab === "connections") {
    const relations = await ConnectionModel.find({ status: "accepted", $or: [{ requesterProfileId: profileId }, { recipientProfileId: profileId }] }).lean();
    const ids = relations.map((item) => String(item.requesterProfileId) === String(profileId) ? item.recipientProfileId : item.requesterProfileId);
    filter.authorProfileId = { $in: ids };
    filter.visibility = { $in: ["public", "connections"] };
  } else {
    filter.visibility = "public";
  }
  const posts = await NetworkPostModel.find(filter).sort({ _id: -1 }).limit(limit + 1).populate("authorProfileId", "displayName username slug profileImageUrl profileType isVerified").lean();
  const page = posts.slice(0, limit);
  const ids = page.map((post) => post._id);
  const [likes, saves] = await Promise.all([PostLikeModel.find({ postId: { $in: ids }, profileId }).select({ postId: 1 }).lean(), SavedPostModel.find({ postId: { $in: ids }, profileId }).select({ postId: 1 }).lean()]);
  const viewer = { liked: new Set(likes.map((item) => item.postId.toString())), saved: new Set(saves.map((item) => item.postId.toString())), profileId };
  return Response.json({ ok: true, posts: page.map((post) => serializePost(post, viewer)), nextCursor: posts.length > limit ? page.at(-1)?._id.toString() : null });
}

export async function POST(req: Request) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const parsed = networkPostInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_post", 400, parsed.error.flatten());
  for (const key of ["linkedArtworkId", "linkedEventId", "collectionItemId"] as const) {
    if (parsed.data[key] && !validId(parsed.data[key])) return apiError(`invalid_${key}`, 400);
  }
  const post = await NetworkPostModel.create({ ...parsed.data, authorProfileId: auth.context.profile._id });
  return Response.json({ ok: true, post: serializePost(post) }, { status: 201 });
}
