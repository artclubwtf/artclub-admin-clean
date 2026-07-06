import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const objectId = Schema.Types.ObjectId;
const mediaSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    type: { type: String, enum: ["image", "video"], required: true },
    alt: { type: String, trim: true },
    width: Number,
    height: Number,
  },
  { _id: false },
);

const networkProfileSchema = new Schema(
  {
    userId: { type: objectId, ref: "User", required: true },
    profileType: { type: String, enum: ["artist", "collector", "gallery", "event_series", "curator", "institution", "art_enthusiast", "other"], required: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    bio: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    disciplines: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    website: { type: String, trim: true },
    instagram: { type: String, trim: true },
    profileImageUrl: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    isPublic: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    allowsMessages: { type: Boolean, default: false },
    donationEnabled: { type: Boolean, default: false },
    canonicalArtistId: { type: objectId, ref: "CanonicalArtist" },
    stripeAccountId: { type: String, trim: true, select: false },
    stripeOnboardingComplete: { type: Boolean, default: false },
    suspendedAt: Date,
  },
  { timestamps: true },
);
networkProfileSchema.index({ userId: 1 }, { unique: true });
networkProfileSchema.index({ slug: 1 }, { unique: true });
networkProfileSchema.index({ username: 1 }, { unique: true });
networkProfileSchema.index({ profileType: 1, city: 1, country: 1 });
networkProfileSchema.index({ displayName: "text", username: "text", disciplines: "text", interests: "text" });

const connectionSchema = new Schema(
  {
    requesterProfileId: { type: objectId, ref: "NetworkProfile", required: true },
    recipientProfileId: { type: objectId, ref: "NetworkProfile", required: true },
    status: { type: String, enum: ["pending", "accepted", "declined", "removed", "blocked"], required: true, default: "pending" },
    respondedAt: Date,
    blockedByProfileId: { type: objectId, ref: "NetworkProfile" },
  },
  { timestamps: true },
);
connectionSchema.index({ requesterProfileId: 1, recipientProfileId: 1 }, { unique: true });
connectionSchema.index({ recipientProfileId: 1, status: 1, createdAt: -1 });

const postSchema = new Schema(
  {
    authorProfileId: { type: objectId, ref: "NetworkProfile", required: true },
    type: { type: String, enum: ["text", "image", "video", "process", "artwork", "collection_item", "event", "update"], required: true },
    text: { type: String, trim: true },
    media: { type: [mediaSchema], default: [] },
    linkedArtworkId: { type: objectId, ref: "CanonicalProduct" },
    linkedEventId: { type: objectId, ref: "NetworkEvent" },
    collectionItemId: { type: objectId, ref: "CollectionItem" },
    visibility: { type: String, enum: ["public", "connections", "private"], default: "public" },
    status: { type: String, enum: ["published", "hidden", "deleted"], default: "published" },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
postSchema.index({ status: 1, visibility: 1, createdAt: -1 });
postSchema.index({ authorProfileId: 1, createdAt: -1 });

const postLikeSchema = new Schema({ postId: { type: objectId, ref: "NetworkPost", required: true }, profileId: { type: objectId, ref: "NetworkProfile", required: true } }, { timestamps: true });
postLikeSchema.index({ postId: 1, profileId: 1 }, { unique: true });

const commentSchema = new Schema(
  { postId: { type: objectId, ref: "NetworkPost", required: true }, authorProfileId: { type: objectId, ref: "NetworkProfile", required: true }, text: { type: String, required: true, trim: true }, status: { type: String, enum: ["published", "hidden", "deleted"], default: "published" } },
  { timestamps: true },
);
commentSchema.index({ postId: 1, createdAt: 1 });

const savedPostSchema = new Schema({ postId: { type: objectId, ref: "NetworkPost", required: true }, profileId: { type: objectId, ref: "NetworkProfile", required: true } }, { timestamps: true });
savedPostSchema.index({ postId: 1, profileId: 1 }, { unique: true });

const collectionItemSchema = new Schema(
  {
    ownerProfileId: { type: objectId, ref: "NetworkProfile", required: true },
    canonicalProductId: { type: objectId, ref: "CanonicalProduct" },
    customArtistName: { type: String, trim: true },
    customArtworkTitle: { type: String, trim: true },
    customImageUrl: { type: String, trim: true },
    acquiredAt: Date,
    acquisitionSource: { type: String, trim: true },
    purchasePriceVisibility: { type: String, enum: ["private", "public"], default: "private" },
    note: { type: String, trim: true },
    visibility: { type: String, enum: ["public", "connections", "private"], default: "private" },
  },
  { timestamps: true },
);
collectionItemSchema.index({ ownerProfileId: 1, createdAt: -1 });

const eventSchema = new Schema(
  {
    organizerProfileId: { type: objectId, ref: "NetworkProfile", required: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    startAt: { type: Date, required: true },
    endAt: Date,
    timezone: { type: String, required: true, trim: true },
    venueName: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    isOnline: { type: Boolean, default: false },
    coordinates: { lat: Number, lng: Number },
    ticketUrl: { type: String, trim: true },
    rsvpEnabled: { type: Boolean, default: true },
    capacity: Number,
    visibility: { type: String, enum: ["public", "connections", "private"], default: "public" },
    status: { type: String, enum: ["draft", "published", "cancelled", "completed"], default: "draft" },
    participantProfileIds: [{ type: objectId, ref: "NetworkProfile" }],
  },
  { timestamps: true },
);
eventSchema.index({ slug: 1 }, { unique: true });
eventSchema.index({ status: 1, startAt: 1, city: 1 });
eventSchema.index({ organizerProfileId: 1, startAt: -1 });

const rsvpSchema = new Schema({ eventId: { type: objectId, ref: "NetworkEvent", required: true }, profileId: { type: objectId, ref: "NetworkProfile", required: true }, status: { type: String, enum: ["going", "cancelled"], default: "going" } }, { timestamps: true });
rsvpSchema.index({ eventId: 1, profileId: 1 }, { unique: true });

const conversationSchema = new Schema(
  { participantProfileIds: [{ type: objectId, ref: "NetworkProfile", required: true }], participantKey: { type: String, required: true }, lastMessageAt: Date, lastMessagePreview: { type: String, trim: true } },
  { timestamps: true },
);
conversationSchema.index({ participantKey: 1 }, { unique: true });
conversationSchema.index({ participantProfileIds: 1, lastMessageAt: -1 });

const messageSchema = new Schema(
  { conversationId: { type: objectId, ref: "NetworkConversation", required: true }, senderProfileId: { type: objectId, ref: "NetworkProfile", required: true }, text: { type: String, trim: true }, media: { type: [mediaSchema], default: [] }, readBy: [{ type: objectId, ref: "NetworkProfile" }], editedAt: Date, deletedAt: Date },
  { timestamps: true },
);
messageSchema.index({ conversationId: 1, createdAt: -1 });

const notificationSchema = new Schema(
  { recipientProfileId: { type: objectId, ref: "NetworkProfile", required: true }, actorProfileId: { type: objectId, ref: "NetworkProfile" }, type: { type: String, enum: ["connection_request", "connection_accepted", "post_like", "post_comment", "new_message", "event_rsvp", "event_update", "donation_received"], required: true }, targetType: String, targetId: objectId, readAt: Date },
  { timestamps: true },
);
notificationSchema.index({ recipientProfileId: 1, readAt: 1, createdAt: -1 });

const donationSchema = new Schema(
  { donorUserId: { type: objectId, ref: "User" }, donorProfileId: { type: objectId, ref: "NetworkProfile" }, artistProfileId: { type: objectId, ref: "NetworkProfile", required: true }, canonicalArtistId: { type: objectId, ref: "CanonicalArtist" }, stripeCheckoutSessionId: { type: String, trim: true }, stripePaymentIntentId: { type: String, trim: true }, grossAmount: { type: Number, required: true }, currency: { type: String, required: true }, platformFee: { type: Number, required: true }, netAmount: { type: Number, required: true }, status: { type: String, enum: ["pending", "paid", "failed", "refunded", "partially_refunded"], default: "pending" }, message: { type: String, trim: true }, isAnonymous: { type: Boolean, default: false }, paidAt: Date, refundedAt: Date },
  { timestamps: true },
);
donationSchema.index({ stripeCheckoutSessionId: 1 }, { unique: true, sparse: true });
donationSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });
donationSchema.index({ artistProfileId: 1, createdAt: -1 });

const reportSchema = new Schema(
  { reporterProfileId: { type: objectId, ref: "NetworkProfile", required: true }, targetType: { type: String, enum: ["profile", "post", "comment", "message", "event"], required: true }, targetId: { type: objectId, required: true }, reason: { type: String, enum: ["spam", "harassment", "hate", "nudity", "copyright", "fraud", "other"], required: true }, details: { type: String, trim: true }, status: { type: String, enum: ["open", "reviewing", "resolved", "dismissed"], default: "open" }, resolvedByUserId: { type: objectId, ref: "User" }, resolvedAt: Date, action: { type: String, trim: true } },
  { timestamps: true },
);
reportSchema.index({ status: 1, createdAt: -1 });

const moderationAuditSchema = new Schema(
  { actorUserId: { type: objectId, ref: "User", required: true }, reportId: { type: objectId, ref: "NetworkReport" }, action: { type: String, required: true, trim: true }, targetType: { type: String, required: true }, targetId: { type: objectId, required: true }, metadata: { type: Schema.Types.Mixed } },
  { timestamps: true },
);
moderationAuditSchema.index({ createdAt: -1 });

type ModelFor<T extends Schema> = Model<InferSchemaType<T>>;
const getModel = <T extends Schema>(name: string, schema: T) => (models[name] as ModelFor<T>) || model(name, schema);

export const NetworkProfileModel = getModel("NetworkProfile", networkProfileSchema);
export const ConnectionModel = getModel("NetworkConnection", connectionSchema);
export const NetworkPostModel = getModel("NetworkPost", postSchema);
export const PostLikeModel = getModel("NetworkPostLike", postLikeSchema);
export const NetworkCommentModel = getModel("NetworkComment", commentSchema);
export const SavedPostModel = getModel("NetworkSavedPost", savedPostSchema);
export const CollectionItemModel = getModel("NetworkCollectionItem", collectionItemSchema);
export const NetworkEventModel = getModel("NetworkEvent", eventSchema);
export const EventRSVPModel = getModel("NetworkEventRSVP", rsvpSchema);
export const NetworkConversationModel = getModel("NetworkConversation", conversationSchema);
export const NetworkMessageModel = getModel("NetworkMessage", messageSchema);
export const NetworkNotificationModel = getModel("NetworkNotification", notificationSchema);
export const DonationModel = getModel("NetworkDonation", donationSchema);
export const NetworkReportModel = getModel("NetworkReport", reportSchema);
export const NetworkModerationAuditModel = getModel("NetworkModerationAudit", moderationAuditSchema);
