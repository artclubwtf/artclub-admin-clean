import { networkCommentInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, notify, validId } from "@/lib/server/network-service";
import { NetworkCommentModel, NetworkPostModel } from "@/lib/server/models";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_post_id");
  const comments = await NetworkCommentModel.find({ postId: id, status: "published" }).sort({ createdAt: 1 }).limit(100).populate("authorProfileId", "displayName username slug profileImageUrl").lean();
  return Response.json({ ok: true, comments: comments.map((comment: any) => ({ id: comment._id.toString(), text: comment.text, createdAt: comment.createdAt, mine: String(comment.authorProfileId?._id) === String(auth.context.profile._id), author: comment.authorProfileId ? { id: comment.authorProfileId._id.toString(), displayName: comment.authorProfileId.displayName, username: comment.authorProfileId.username, slug: comment.authorProfileId.slug, profileImageUrl: comment.authorProfileId.profileImageUrl || "" } : null })) });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_post_id");
  const parsed = networkCommentInputSchema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return apiError("invalid_comment", 400, parsed.error.flatten());
  const post = await NetworkPostModel.findOne({ _id: id, status: "published" }); if (!post) return apiError("post_not_found", 404);
  const comment = await NetworkCommentModel.create({ postId: post._id, authorProfileId: auth.context.profile._id, text: parsed.data.text });
  await NetworkPostModel.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  await notify({ recipientProfileId: post.authorProfileId, actorProfileId: auth.context.profile._id, type: "post_comment", targetType: "post", targetId: post._id });
  return Response.json({ ok: true, comment: { id: comment._id.toString(), text: comment.text, createdAt: comment.createdAt, mine: true } }, { status: 201 });
}
