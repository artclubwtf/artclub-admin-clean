import { z } from "zod";

export const networkProfileTypes = [
  "artist",
  "collector",
  "gallery",
  "event_series",
  "curator",
  "institution",
  "art_enthusiast",
  "other",
] as const;
export const networkProfileTypeSchema = z.enum(networkProfileTypes);
export type NetworkProfileType = z.infer<typeof networkProfileTypeSchema>;

export const networkVisibilitySchema = z.enum(["public", "connections", "private"]);
export const networkMediaSchema = z.object({
  url: z.url().max(2048),
  type: z.enum(["image", "video"]),
  alt: z.string().trim().max(300).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const optionalUrl = z.union([z.literal(""), z.url().max(2048)]).optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const networkProfileInputSchema = z.object({
  profileType: networkProfileTypeSchema,
  displayName: z.string().trim().min(1).max(120),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  bio: optionalText(1200),
  city: optionalText(100),
  country: optionalText(100),
  disciplines: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  interests: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  website: optionalUrl,
  instagram: optionalText(100),
  profileImageUrl: optionalUrl,
  coverImageUrl: optionalUrl,
  isPublic: z.boolean().default(true),
  allowsMessages: z.boolean().default(false),
  donationEnabled: z.boolean().default(false),
});
export type NetworkProfileInput = z.infer<typeof networkProfileInputSchema>;

export const networkPostTypes = ["text", "image", "video", "process", "artwork", "collection_item", "event", "update"] as const;
export const networkPostInputSchema = z
  .object({
    type: z.enum(networkPostTypes).default("text"),
    text: z.string().trim().max(5000).default(""),
    media: z.array(networkMediaSchema).max(10).default([]),
    linkedArtworkId: optionalText(64),
    linkedEventId: optionalText(64),
    collectionItemId: optionalText(64),
    visibility: networkVisibilitySchema.default("public"),
  })
  .superRefine((value, ctx) => {
    if (!value.text && value.media.length === 0 && !value.linkedArtworkId && !value.linkedEventId && !value.collectionItemId) {
      ctx.addIssue({ code: "custom", message: "post_requires_content", path: ["text"] });
    }
  });
export type NetworkPostInput = z.infer<typeof networkPostInputSchema>;

export const networkCommentInputSchema = z.object({ text: z.string().trim().min(1).max(2000) });
export const connectionActionSchema = z.object({ action: z.enum(["accept", "decline", "remove", "cancel", "block"]) });

export const messageRequestInputSchema = z.object({
  profileId: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(100),
});

export const networkMessageInputSchema = z
  .object({ text: z.string().trim().max(5000).default(""), media: z.array(networkMediaSchema).max(4).default([]) })
  .superRefine((value, ctx) => {
    if (!value.text && value.media.length === 0) ctx.addIssue({ code: "custom", message: "message_requires_content", path: ["text"] });
  });

export const networkEventInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5000).default(""),
  coverImageUrl: optionalUrl,
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  timezone: z.string().trim().min(1).max(80),
  venueName: optionalText(180),
  address: optionalText(300),
  city: optionalText(100),
  country: optionalText(100),
  isOnline: z.boolean().default(false),
  ticketUrl: optionalUrl,
  rsvpEnabled: z.boolean().default(true),
  capacity: z.number().int().positive().max(1_000_000).optional(),
  visibility: z.enum(["public", "connections", "private"]).default("public"),
  participantProfileIds: z.array(z.string().trim().min(1).max(64)).max(100).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
}).superRefine((value, ctx) => {
  if (!value.isOnline && !value.venueName && !value.address) ctx.addIssue({ code: "custom", message: "event_requires_location", path: ["venueName"] });
  if (value.endAt && value.endAt <= value.startAt) ctx.addIssue({ code: "custom", message: "event_end_before_start", path: ["endAt"] });
});
export type NetworkEventInput = z.infer<typeof networkEventInputSchema>;

export const collectionItemInputSchema = z.object({
  canonicalProductId: optionalText(64),
  customArtistName: optionalText(160),
  customArtworkTitle: optionalText(200),
  customImageUrl: optionalUrl,
  acquiredAt: z.coerce.date().optional(),
  acquisitionSource: optionalText(160),
  purchasePriceVisibility: z.enum(["private", "public"]).default("private"),
  note: optionalText(2000),
  visibility: networkVisibilitySchema.default("private"),
}).superRefine((value, ctx) => {
  if (!value.canonicalProductId && (!value.customArtistName || !value.customArtworkTitle)) {
    ctx.addIssue({ code: "custom", message: "collection_item_requires_artwork", path: ["canonicalProductId"] });
  }
});

export const networkReportInputSchema = z.object({
  targetType: z.enum(["profile", "post", "comment", "message", "event"]),
  targetId: z.string().trim().min(1).max(64),
  reason: z.enum(["spam", "harassment", "hate", "nudity", "copyright", "fraud", "other"]),
  details: optionalText(1000),
});

export const networkAnalyticsEventTypes = [
  "landing_view", "signup_started", "signup_completed", "login_completed", "onboarding_started", "onboarding_completed",
  "profile_impression", "profile_view", "profile_share", "profile_link_click", "profile_message_click", "profile_donation_click",
  "profile_link_copy", "profile_native_share", "profile_like", "profile_unlike", "profile_follow", "profile_unfollow",
  "feed_view", "post_impression", "post_view", "post_create", "post_like", "post_comment", "post_save", "post_share",
  "network_search", "profile_search_result_impression", "connection_request_sent", "connection_request_accepted", "connection_removed",
  "connection_request_received", "connection_request_declined",
  "conversation_started", "message_sent", "message_received", "message_read",
  "message_request_sent", "message_request_accepted", "message_request_declined",
  "event_impression", "event_view", "event_created", "event_published", "event_rsvp", "event_ticket_click", "event_share",
  "donation_started", "donation_checkout_opened", "donation_completed", "donation_failed", "donation_refunded",
  "shop_click", "artwork_shop_click", "product_view", "purchase_attributed",
  "create_menu_opened", "artwork_upload_started", "artwork_upload_completed", "post_create_started", "post_created", "event_create_started", "event_created", "collection_item_created", "artwork_feed_impression", "artwork_feed_click", "post_engagement",
] as const;

export const networkAnalyticsInputSchema = z.object({
  eventType: z.enum(networkAnalyticsEventTypes),
  targetProfileId: optionalText(64),
  canonicalArtistId: optionalText(64),
  canonicalProductId: optionalText(64),
  postId: optionalText(64),
  eventId: optionalText(64),
  source: z.string().trim().min(1).max(80).default("network"),
  path: optionalText(500),
  referrer: optionalText(1000),
});

export const donationCheckoutInputSchema = z.object({
  artistProfileId: z.string().trim().min(1).max(64),
  amount: z.number().int().min(100).max(100_000),
  currency: z.string().trim().toLowerCase().length(3).default("eur"),
  message: optionalText(500),
  isAnonymous: z.boolean().default(false),
});

export const networkRegistrationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
});
