import { requireNetworkApiContext } from "@/lib/server/network-context";
import { apiError, validId } from "@/lib/server/network-service";
import { NetworkPostModel, SavedPostModel } from "@/lib/server/models";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_post_id");
  if (!(await NetworkPostModel.exists({ _id: id, status: "published" }))) return apiError("post_not_found", 404);
  await SavedPostModel.updateOne({ postId: id, profileId: auth.context.profile._id }, { $setOnInsert: { postId: id, profileId: auth.context.profile._id } }, { upsert: true });
  return Response.json({ ok: true, saved: true });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireNetworkApiContext(); if (!auth.ok) return auth.response;
  const { id } = await params; if (!validId(id)) return apiError("invalid_post_id");
  await SavedPostModel.deleteOne({ postId: id, profileId: auth.context.profile._id });
  return Response.json({ ok: true, saved: false });
}
