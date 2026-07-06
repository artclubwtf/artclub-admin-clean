import { Types } from "mongoose";
import { ConnectionModel, NetworkNotificationModel } from "@/lib/server/models";
import { canCreateNetworkEvent, canSendNetworkMessage } from "@artclub/models";

export function validId(value: unknown): value is string {
  return typeof value === "string" && Types.ObjectId.isValid(value);
}

export function apiError(code: string, status = 400, details?: unknown) {
  return Response.json({ ok: false, error: { code, details } }, { status });
}

export function cursorFilter(cursor: string | null) {
  return cursor && Types.ObjectId.isValid(cursor) ? { _id: { $lt: new Types.ObjectId(cursor) } } : {};
}

export function profilePairKey(a: Types.ObjectId | string, b: Types.ObjectId | string) { return [String(a), String(b)].sort().join(":"); }

export async function connectionState(a: Types.ObjectId | string, b: Types.ObjectId | string) {
  const pairKey = profilePairKey(a, b);
  const relation = await ConnectionModel.findOne({
    $or: [{ pairKey },
      { requesterProfileId: a, recipientProfileId: b },
      { requesterProfileId: b, recipientProfileId: a },
    ],
  }).lean();
  return relation;
}

export async function areConnected(a: Types.ObjectId | string, b: Types.ObjectId | string) {
  return (await connectionState(a, b))?.status === "accepted";
}

export async function isBlocked(a: Types.ObjectId | string, b: Types.ObjectId | string) {
  return (await connectionState(a, b))?.status === "blocked";
}

export async function canMessage(sender: any, recipient: any) {
  const relation = await connectionState(sender._id, recipient._id);
  return !recipient.suspendedAt && canSendNetworkMessage({ sameProfile: String(sender._id) === String(recipient._id), blocked: relation?.status === "blocked", connected: relation?.status === "accepted", recipientAllowsMessages: false });
}

export async function notify(input: { recipientProfileId: unknown; actorProfileId?: unknown; type: string; targetType?: string; targetId?: unknown }) {
  if (!input.recipientProfileId || String(input.recipientProfileId) === String(input.actorProfileId || "")) return;
  await NetworkNotificationModel.create(input as any);
}

export function serializePost(post: any, viewer?: { liked: Set<string>; saved: Set<string>; profileId?: unknown }) {
  const author = post.authorProfileId && typeof post.authorProfileId === "object" && "displayName" in post.authorProfileId ? post.authorProfileId : null;
  return {
    id: post._id.toString(), type: post.type, text: post.text || "", media: post.media || [], visibility: post.visibility,
    linkedArtworkId: post.linkedArtworkId?.toString(), linkedEventId: post.linkedEventId?.toString(), collectionItemId: post.collectionItemId?.toString(),
    likeCount: post.likeCount || 0, commentCount: post.commentCount || 0, createdAt: post.createdAt, updatedAt: post.updatedAt,
    liked: viewer?.liked.has(post._id.toString()) || false, saved: viewer?.saved.has(post._id.toString()) || false,
    mine: String(author?._id || post.authorProfileId) === String(viewer?.profileId || ""),
    author: author ? { id: author._id.toString(), slug: author.slug, username: author.username, displayName: author.displayName, profileImageUrl: author.profileImageUrl || "", profileType: author.profileType, isVerified: author.isVerified === true } : undefined,
  };
}

export const EVENT_CREATOR_TYPES = new Set(["artist", "gallery", "event_series", "curator", "institution"]);
