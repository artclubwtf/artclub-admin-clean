import { calculateProfileCompletion } from "@artclub/models";

import { requireNetworkApiContext, serializeNetworkProfile } from "@/lib/server/network-context";
import { serializeEvent } from "@/lib/server/network-events";
import { serializePost } from "@/lib/server/network-service";
import {
  AnalyticsEventModel,
  CanonicalProductModel,
  ConnectionModel,
  EventRSVPModel,
  NetworkConversationModel,
  NetworkEventModel,
  NetworkFollowModel,
  NetworkMessageModel,
  NetworkPostModel,
  NetworkProfileModel,
} from "@/lib/server/models";
import { listUnifiedProfiles } from "@/lib/server/unified-profile";

const DAY = 86_400_000;

export async function GET() {
  const auth = await requireNetworkApiContext();
  if (!auth.ok) return auth.response;

  const profile = auth.context.profile;
  const profileId = profile._id;
  const acceptedQuery = { status: "accepted", $or: [{ requesterProfileId: profileId }, { recipientProfileId: profileId }] };
  const [relations, follows, artworkCount, eventCount, profileViews, newConnections] = await Promise.all([
    ConnectionModel.find(acceptedQuery).select({ requesterProfileId: 1, recipientProfileId: 1 }).lean(),
    NetworkFollowModel.find({ followerProfileId: profileId }).select({ followedProfileId: 1 }).lean(),
    profile.canonicalArtistId ? CanonicalProductModel.countDocuments({ canonicalArtistId: profile.canonicalArtistId, type: "artwork", status: { $ne: "archived" } }) : 0,
    NetworkEventModel.countDocuments({ organizerProfileId: profileId }),
    AnalyticsEventModel.countDocuments({ eventType: "profile_view", targetProfileId: profileId, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
    ConnectionModel.countDocuments({ ...acceptedQuery, respondedAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
  ]);

  const connectedIds = relations.map((item) => String(item.requesterProfileId) === String(profileId) ? item.recipientProfileId : item.requesterProfileId);
  const followedIds = follows.map((item) => item.followedProfileId);
  const networkIds = Array.from(new Map([...connectedIds, ...followedIds].map((id) => [String(id), id])).values());
  const completion = calculateProfileCompletion({
    profileType: profile.profileType,
    displayName: profile.displayName,
    profileImageUrl: profile.profileImageUrl,
    bio: profile.bio,
    city: profile.city,
    country: profile.country,
    website: profile.website,
    instagram: profile.instagram,
    disciplines: profile.disciplines,
    interests: profile.interests,
    artworkCount,
    eventCount,
  });

  const [conversationDocs, requestDocs, eventDocs, candidateProfiles, postDocs] = await Promise.all([
    NetworkConversationModel.find({ participantProfileIds: profileId }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(5).populate("participantProfileIds", "displayName username slug profileImageUrl profileType city country").lean(),
    ConnectionModel.find({ recipientProfileId: profileId, status: "pending" }).sort({ createdAt: -1 }).limit(5).populate("requesterProfileId", "displayName username slug profileImageUrl profileType city country").lean(),
    NetworkEventModel.find({ status: "published", visibility: "public", startAt: { $gte: new Date() } }).sort({ startAt: 1 }).limit(3).populate("organizerProfileId", "displayName username slug profileImageUrl profileType").lean(),
    listUnifiedProfiles({ city: profile.city || undefined, excludeUserId: auth.context.user._id }),
    networkIds.length ? NetworkPostModel.find({ authorProfileId: { $in: networkIds }, status: "published", visibility: { $in: ["public", "connections"] } }).sort({ createdAt: -1 }).limit(5).populate("authorProfileId", "displayName username slug profileImageUrl profileType isVerified").lean() : [],
  ]);

  const conversationIds = conversationDocs.map((item) => item._id);
  const [unreadRows, eventRsvps] = await Promise.all([
    NetworkMessageModel.aggregate([
      { $match: { conversationId: { $in: conversationIds }, senderProfileId: { $ne: profileId }, readBy: { $ne: profileId }, deletedAt: { $exists: false } } },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]),
    EventRSVPModel.find({ eventId: { $in: eventDocs.map((item) => item._id) }, profileId, status: "going" }).lean(),
  ]);
  const unread = new Map(unreadRows.map((item) => [String(item._id), item.count]));
  const attending = new Set(eventRsvps.map((item) => String(item.eventId)));
  const excluded = new Set([String(profileId), ...networkIds.map(String), ...requestDocs.map((item: any) => String(item.requesterProfileId?._id || item.requesterProfileId))]);
  const suggestedProfiles = candidateProfiles.filter((item) => !excluded.has(String(item.networkProfileId || item.id))).slice(0, 5).map((item) => {
    const sharedDiscipline = item.disciplines.find((value) => profile.disciplines?.includes(value));
    const reason = profile.city && item.city?.toLowerCase() === profile.city.toLowerCase() ? item.city : sharedDiscipline || `Relevant ${item.profileType.replaceAll("_", " ")}`;
    return { ...item, reason };
  });

  return Response.json({
    ok: true,
    profileSummary: { profile: serializeNetworkProfile(profile), completion, profileViews, newConnections, artworkCount, eventCount },
    conversations: conversationDocs.map((item: any) => {
      const participant = item.participantProfileIds.find((value: any) => String(value._id) !== String(profileId));
      return { id: String(item._id), participant: participant ? serializeNetworkProfile(participant) : null, lastMessagePreview: item.lastMessagePreview || "", lastMessageAt: item.lastMessageAt || item.updatedAt, unreadCount: unread.get(String(item._id)) || 0 };
    }),
    upcomingEvents: eventDocs.map((item) => serializeEvent(item, { viewerId: profileId, attending: attending.has(String(item._id)) })),
    connectionRequests: requestDocs.map((item: any) => ({ id: String(item._id), profile: item.requesterProfileId ? serializeNetworkProfile(item.requesterProfileId) : null, createdAt: item.createdAt })),
    suggestedProfiles,
    recentUpdates: postDocs.map((item) => serializePost(item, { liked: new Set(), saved: new Set(), profileId })),
    hasMore: { conversations: conversationDocs.length === 5, events: eventDocs.length === 3, requests: requestDocs.length === 5, suggestions: candidateProfiles.length > 5, updates: postDocs.length === 5 },
  });
}
