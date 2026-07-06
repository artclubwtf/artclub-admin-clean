import { networkPostInputSchema } from "@artclub/models";
import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, serializePost, validId } from "@/lib/server/network-service";
import { NetworkPostModel } from "@/lib/server/models";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_post_id");
  const parsed = networkPostInputSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_post", 400, parsed.error.flatten());
  const post = await NetworkPostModel.findOneAndUpdate({ _id: id, authorProfileId: auth.context.profile._id, status: "published" }, { $set: parsed.data }, { new: true, runValidators: true });
  if (!post) return apiError("post_not_found", 404);
  return Response.json({ ok: true, post: serializePost(post) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!validId(id)) return apiError("invalid_post_id");
  const post = await NetworkPostModel.findOneAndUpdate({ _id: id, authorProfileId: auth.context.profile._id, status: "published" }, { $set: { status: "deleted" } }, { new: true });
  if (!post) return apiError("post_not_found", 404);
  return Response.json({ ok: true });
}
