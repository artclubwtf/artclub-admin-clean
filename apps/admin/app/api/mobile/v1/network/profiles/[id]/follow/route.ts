import { Types } from "mongoose";

import { mobileError, mobileNetworkContext } from "@/lib/mobileNetwork";
import { NetworkFollowModel, NetworkNotificationModel, NetworkProfileModel } from "@/models/Network";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const { id } = await params;
  if (!Types.ObjectId.isValid(id) || String(auth.profile!._id) === id || !(await NetworkProfileModel.exists({ _id: id }))) return mobileError("invalid_profile", 404);
  await NetworkFollowModel.updateOne({ followerProfileId: auth.profile!._id, followedProfileId: id }, { $setOnInsert: { followerProfileId: auth.profile!._id, followedProfileId: id } }, { upsert: true });
  await NetworkNotificationModel.create({ recipientProfileId: id, actorProfileId: auth.profile!._id, type: "profile_follow", targetType: "profile", targetId: auth.profile!._id });
  return Response.json({ ok: true, following: true });
}
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response; const { id } = await context.params;
  await NetworkFollowModel.deleteOne({ followerProfileId: auth.profile!._id, followedProfileId: id }); return Response.json({ ok: true, following: false });
}
