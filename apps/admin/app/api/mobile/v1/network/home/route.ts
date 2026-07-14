import { mobileNetworkContext, mobileProfileSummary, serializeMobileProfile } from "@/lib/mobileNetwork";
import { ConnectionModel, EventRSVPModel, NetworkConversationModel, NetworkEventModel, NetworkFollowModel, NetworkMessageModel, NetworkPostModel, NetworkProfileModel } from "@/models/Network";

export async function GET(req: Request) {
  const auth = await mobileNetworkContext(req); if (!auth.ok) return auth.response;
  const profile = auth.profile!; const id = profile._id;
  const [summary, relations, follows, conversations, requests, events] = await Promise.all([
    mobileProfileSummary(profile),
    ConnectionModel.find({ status: "accepted", $or: [{ requesterProfileId: id }, { recipientProfileId: id }] }).lean(),
    NetworkFollowModel.find({ followerProfileId: id }).lean(),
    NetworkConversationModel.find({ participantProfileIds: id }).sort({ lastMessageAt: -1 }).limit(5).populate("participantProfileIds", "displayName username slug profileImageUrl profileType city country").lean(),
    ConnectionModel.find({ recipientProfileId: id, status: "pending" }).sort({ createdAt: -1 }).limit(5).populate("requesterProfileId", "displayName username slug profileImageUrl profileType city country").lean(),
    NetworkEventModel.find({ status: "published", visibility: "public", startAt: { $gte: new Date() } }).sort({ startAt: 1 }).limit(3).populate("organizerProfileId", "displayName username slug profileImageUrl profileType").lean(),
  ]);
  const networkIds = Array.from(new Set([...relations.map((item) => String(item.requesterProfileId) === String(id) ? String(item.recipientProfileId) : String(item.requesterProfileId)), ...follows.map((item) => String(item.followedProfileId))]));
  const [unreadRows, rsvps, updates, candidates] = await Promise.all([
    NetworkMessageModel.aggregate([{ $match: { conversationId: { $in: conversations.map((item) => item._id) }, senderProfileId: { $ne: id }, readBy: { $ne: id } } }, { $group: { _id: "$conversationId", count: { $sum: 1 } } }]),
    EventRSVPModel.find({ eventId: { $in: events.map((item) => item._id) }, profileId: id, status: "going" }).lean(),
    networkIds.length ? NetworkPostModel.find({ authorProfileId: { $in: networkIds }, status: "published", visibility: { $in: ["public", "connections"] } }).sort({ createdAt: -1 }).limit(5).populate("authorProfileId", "displayName username slug profileImageUrl profileType").lean() : [],
    NetworkProfileModel.find({ _id: { $nin: [id, ...networkIds] }, isPublic: true, suspendedAt: { $exists: false }, ...(profile.city ? { city: new RegExp(`^${profile.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } : {}) }).sort({ isVerified: -1, updatedAt: -1 }).limit(5).lean(),
  ]);
  const unread = new Map(unreadRows.map((item) => [String(item._id), item.count])); const attending = new Set(rsvps.map((item) => String(item.eventId)));
  return Response.json({ ok: true, profileSummary: summary, conversations: conversations.map((item: any) => { const other = item.participantProfileIds.find((value: any) => String(value._id) !== String(id)); return { id: String(item._id), participant: other ? serializeMobileProfile(other) : null, lastMessagePreview: item.lastMessagePreview || "", lastMessageAt: item.lastMessageAt, unreadCount: unread.get(String(item._id)) || 0 }; }), upcomingEvents: events.map((item: any) => ({ id: String(item._id), title: item.title, coverImageUrl: item.coverImageUrl || "", startAt: item.startAt, timezone: item.timezone, city: item.city || "", venueName: item.venueName || "", attending: attending.has(String(item._id)), organizer: item.organizerProfileId ? serializeMobileProfile(item.organizerProfileId) : null })), connectionRequests: requests.map((item: any) => ({ id: String(item._id), profile: item.requesterProfileId ? serializeMobileProfile(item.requesterProfileId) : null })), suggestedProfiles: candidates.map((item) => ({ ...serializeMobileProfile(item), reason: item.city || `Relevant ${item.profileType.replaceAll("_", " ")}` })), recentUpdates: updates.map((item: any) => ({ id: String(item._id), text: item.text || "", type: item.type, media: item.media || [], createdAt: item.createdAt, author: item.authorProfileId ? serializeMobileProfile(item.authorProfileId) : null })) });
}
