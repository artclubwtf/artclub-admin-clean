import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, notify, validId } from "@/lib/server/network-service";
import { NetworkPostModel, PostLikeModel } from "@/lib/server/models";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_post_id");
  const post = await NetworkPostModel.findOne({ _id: id, status: "published" });
  if (!post) return apiError("post_not_found", 404);
  const result = await PostLikeModel.updateOne({ postId: post._id, profileId: auth.context.profile._id }, { $setOnInsert: { postId: post._id, profileId: auth.context.profile._id } }, { upsert: true });
  if (result.upsertedCount) {
    await NetworkPostModel.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
    await notify({ recipientProfileId: post.authorProfileId, actorProfileId: auth.context.profile._id, type: "post_like", targetType: "post", targetId: post._id });
  }
  return Response.json({ ok: true, liked: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_post_id");
  const removed = await PostLikeModel.deleteOne({ postId: id, profileId: auth.context.profile._id });
  if (removed.deletedCount) await NetworkPostModel.updateOne({ _id: id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
  return Response.json({ ok: true, liked: false });
}
