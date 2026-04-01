import { Types } from "mongoose";

import type {
  WorkspaceConversationReferenceInput,
  WorkspaceConversationStatus,
  WorkspaceConversationType,
  WorkspaceSenderRole,
} from "@artclub/models";
import { workspaceConversationReferenceKinds } from "@artclub/models";

import { connectMongo } from "./mongodb";
import { ensureArtistWorkspaceThreadIndexes } from "./artistWorkspaceThreadIndexes";
import { ArtistMediaV2Model } from "../models/ArtistMediaV2";
import { ArtistWorkspaceMessageModel } from "../models/ArtistWorkspaceMessage";
import { ArtistWorkspaceThreadModel } from "../models/ArtistWorkspaceThread";
import { UserModel } from "../models/User";

type WorkspaceOwner = {
  shopDomain: string;
  artistKey: string;
  userId: Types.ObjectId;
  artistId?: string | null;
  email?: string;
  name?: string;
};

type WorkspaceMediaDoc = {
  _id: Types.ObjectId;
  url?: string | null;
  previewUrl?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  kind?: string | null;
};

type MediaUrlResolver = (media: WorkspaceMediaDoc) => { url: string; previewUrl: string };

export type WorkspaceConversationSummary = {
  id: string;
  subject: string;
  type: WorkspaceConversationType;
  status: WorkspaceConversationStatus;
  lastMessageAt?: Date | null;
  lastMessagePreview: string;
  lastMessageSenderRole?: WorkspaceSenderRole | null;
  unreadCount: number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  referenceCount: number;
};

export type WorkspaceMessageAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  kind: string;
  url: string;
  previewUrl: string;
};

export type WorkspaceMessageItem = {
  id: string;
  senderRole: WorkspaceSenderRole;
  senderLabel: string;
  text: string;
  attachments: WorkspaceMessageAttachment[];
  createdAt?: Date | null;
};

export type WorkspaceConversationDetail = {
  conversation: WorkspaceConversationSummary & {
    artistLastReadAt?: Date | null;
    teamLastReadAt?: Date | null;
    references: WorkspaceConversationReferenceInput[];
  };
  messages: WorkspaceMessageItem[];
};

function buildDefaultMediaUrls(media: WorkspaceMediaDoc) {
  return {
    url: media.url || "",
    previewUrl: media.previewUrl || media.url || "",
  };
}

function truncatePreview(text: string, hasAttachments: boolean) {
  const normalized = text.trim();
  if (normalized) {
    return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
  }
  return hasAttachments ? "Attachment" : "New conversation";
}

function fallbackSubject(type: WorkspaceConversationType) {
  switch (type) {
    case "support":
      return "Support";
    case "inquiry":
      return "Inquiry";
    case "exhibition":
      return "Exhibition";
    case "sales":
      return "Sales";
    case "logistics":
      return "Logistics";
    case "request":
      return "Request";
    default:
      return "General";
  }
}

function normalizeSubject(subject: string | undefined, type: WorkspaceConversationType) {
  const cleaned = subject?.trim() || "";
  return cleaned || fallbackSubject(type);
}

function getViewerReadField(role: WorkspaceSenderRole) {
  return role === "artist" ? "artistLastReadAt" : "teamLastReadAt";
}

function getThreadOwnerFilter(input: { shopDomain: string; artistKey: string }) {
  return {
    shopDomain: input.shopDomain.toLowerCase().trim(),
    artistKey: input.artistKey.trim(),
  };
}

export async function resolveWorkspaceOwnerByLegacyArtistId(artistId: string) {
  await connectMongo();
  if (!Types.ObjectId.isValid(artistId)) return null;

  const user = await UserModel.findOne({
    artistId: new Types.ObjectId(artistId),
    role: "artist",
    isActive: true,
    artistKey: { $exists: true, $ne: null },
    shopDomain: { $exists: true, $ne: null },
  })
    .select({ _id: 1, artistId: 1, artistKey: 1, shopDomain: 1, email: 1, name: 1 })
    .lean();

  if (!user?.artistKey || !user.shopDomain) return null;

  return {
    shopDomain: user.shopDomain,
    artistKey: user.artistKey,
    userId: user._id,
    artistId: user.artistId?.toString() || null,
    email: user.email || undefined,
    name: user.name || undefined,
  } satisfies WorkspaceOwner;
}

export async function resolveWorkspaceOwnerByArtistKeys(input: { shopDomain: string; artistKey: string }) {
  await connectMongo();

  const user = await UserModel.findOne({
    role: "artist",
    isActive: true,
    shopDomain: input.shopDomain.toLowerCase().trim(),
    artistKey: input.artistKey.trim(),
  })
    .select({ _id: 1, artistId: 1, artistKey: 1, shopDomain: 1, email: 1, name: 1 })
    .lean();

  if (!user?.artistKey || !user.shopDomain) return null;

  return {
    shopDomain: user.shopDomain,
    artistKey: user.artistKey,
    userId: user._id,
    artistId: user.artistId?.toString() || null,
    email: user.email || undefined,
    name: user.name || undefined,
  } satisfies WorkspaceOwner;
}

async function countUnreadMessages(threadId: Types.ObjectId, since: Date | null | undefined, viewerRole: WorkspaceSenderRole) {
  const filter: Record<string, unknown> = {
    threadId,
    senderRole: viewerRole === "artist" ? "team" : "artist",
  };
  if (since) {
    filter.createdAt = { $gt: since };
  }
  return ArtistWorkspaceMessageModel.countDocuments(filter);
}

async function toConversationSummary(
  thread: {
    _id: Types.ObjectId;
    subject?: string | null;
    type?: WorkspaceConversationType;
    status?: WorkspaceConversationStatus;
    lastMessageAt?: Date | null;
    lastMessagePreview?: string | null;
    lastMessageSenderRole?: WorkspaceSenderRole | null;
    artistLastReadAt?: Date | null;
    teamLastReadAt?: Date | null;
    references?: Array<{ kind: string; refId: string; label?: string | null }> | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  },
  viewerRole: WorkspaceSenderRole,
) {
  const lastReadAt = viewerRole === "artist" ? thread.artistLastReadAt : thread.teamLastReadAt;
  const shouldCountUnread =
    thread.lastMessageSenderRole != null &&
    thread.lastMessageSenderRole !== viewerRole &&
    Boolean(thread.lastMessageAt && (!lastReadAt || thread.lastMessageAt > lastReadAt));

  return {
    id: thread._id.toString(),
    subject: normalizeSubject(thread.subject || undefined, thread.type || "general"),
    type: thread.type || "general",
    status: thread.status || "open",
    lastMessageAt: thread.lastMessageAt || null,
    lastMessagePreview: thread.lastMessagePreview || "",
    lastMessageSenderRole: thread.lastMessageSenderRole || null,
    unreadCount: shouldCountUnread ? await countUnreadMessages(thread._id, lastReadAt, viewerRole) : 0,
    createdAt: thread.createdAt || null,
    updatedAt: thread.updatedAt || null,
    referenceCount: Array.isArray(thread.references) ? thread.references.length : 0,
  } satisfies WorkspaceConversationSummary;
}

async function loadAttachmentsForMessages(
  input: {
    shopDomain: string;
    artistKey: string;
    messages: Array<{ mediaIds?: Types.ObjectId[] | null }>;
    mediaUrlResolver?: MediaUrlResolver;
  },
) {
  const mediaIds = Array.from(
    new Set(
      input.messages
        .flatMap((message) => message.mediaIds || [])
        .map((id) => id?.toString())
        .filter(Boolean),
    ),
  ) as string[];

  if (mediaIds.length === 0) {
    return {} as Record<string, WorkspaceMessageAttachment>;
  }

  const docs = await ArtistMediaV2Model.find({
    _id: { $in: mediaIds.map((id) => new Types.ObjectId(id)) },
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
  })
    .select({ _id: 1, url: 1, previewUrl: 1, filename: 1, mimeType: 1, kind: 1 })
    .lean();

  const map: Record<string, WorkspaceMessageAttachment> = {};
  for (const doc of docs) {
    const urls = (input.mediaUrlResolver || buildDefaultMediaUrls)(doc);
    map[doc._id.toString()] = {
      id: doc._id.toString(),
      filename: doc.filename || "attachment",
      mimeType: doc.mimeType || "",
      kind: doc.kind || "other",
      url: urls.url,
      previewUrl: urls.previewUrl,
    };
  }
  return map;
}

export async function listWorkspaceConversations(input: {
  shopDomain: string;
  artistKey: string;
  viewerRole: WorkspaceSenderRole;
}) {
  await connectMongo();
  await ensureArtistWorkspaceThreadIndexes();

  const threads = await ArtistWorkspaceThreadModel.find(getThreadOwnerFilter(input))
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  return Promise.all(threads.map((thread) => toConversationSummary(thread, input.viewerRole)));
}

export async function getWorkspaceConversationDetail(input: {
  shopDomain: string;
  artistKey: string;
  threadId: string;
  viewerRole: WorkspaceSenderRole;
  mediaUrlResolver?: MediaUrlResolver;
}) {
  await connectMongo();
  await ensureArtistWorkspaceThreadIndexes();

  if (!Types.ObjectId.isValid(input.threadId)) return null;

  const thread = await ArtistWorkspaceThreadModel.findOne({
    _id: new Types.ObjectId(input.threadId),
    ...getThreadOwnerFilter(input),
  }).lean();

  if (!thread) return null;

  const messages = await ArtistWorkspaceMessageModel.find({ threadId: thread._id }).sort({ createdAt: 1 }).lean();
  const attachmentMap = await loadAttachmentsForMessages({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    messages,
    mediaUrlResolver: input.mediaUrlResolver,
  });

  return {
    conversation: {
      ...(await toConversationSummary(thread, input.viewerRole)),
      artistLastReadAt: thread.artistLastReadAt || null,
      teamLastReadAt: thread.teamLastReadAt || null,
      references: Array.isArray(thread.references)
        ? thread.references
            .filter((item) => workspaceConversationReferenceKinds.safeParse(item.kind).success)
            .map((item) => ({
              kind: item.kind as WorkspaceConversationReferenceInput["kind"],
              refId: item.refId,
              label: item.label || undefined,
            }))
        : [],
    },
    messages: messages.map((message) => ({
      id: message._id.toString(),
      senderRole: message.senderRole,
      senderLabel:
        message.senderLabel || (message.senderRole === "artist" ? "Artist" : "ARTCLUB Team"),
      text: message.text || "",
      attachments: (message.mediaIds || []).map((id) => attachmentMap[id.toString()]).filter(Boolean),
      createdAt: message.createdAt || null,
    })),
  } satisfies WorkspaceConversationDetail;
}

async function resolveAllowedMediaIds(input: { shopDomain: string; artistKey: string; mediaIds: string[] }) {
  const validMediaIds = input.mediaIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  if (validMediaIds.length === 0) return [] as Types.ObjectId[];

  const ownedMedia = await ArtistMediaV2Model.find({
    _id: { $in: validMediaIds },
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
  })
    .select({ _id: 1 })
    .lean();

  return ownedMedia.map((item) => item._id);
}

export async function createWorkspaceConversation(input: {
  shopDomain: string;
  artistKey: string;
  userId?: Types.ObjectId | string | null;
  senderUserId?: Types.ObjectId | string | null;
  senderRole: WorkspaceSenderRole;
  senderLabel?: string;
  subject?: string;
  type: WorkspaceConversationType;
  text: string;
  mediaIds?: string[];
  references?: WorkspaceConversationReferenceInput[];
  mediaUrlResolver?: MediaUrlResolver;
}) {
  await connectMongo();
  await ensureArtistWorkspaceThreadIndexes();

  const owner =
    input.userId != null
      ? { userId: typeof input.userId === "string" ? new Types.ObjectId(input.userId) : input.userId }
      : await resolveWorkspaceOwnerByArtistKeys({
          shopDomain: input.shopDomain,
          artistKey: input.artistKey,
        });

  if (!owner?.userId) {
    throw new Error("workspace_owner_not_found");
  }

  const now = new Date();
  const allowedMediaIds = await resolveAllowedMediaIds({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    mediaIds: input.mediaIds || [],
  });

  const thread = await ArtistWorkspaceThreadModel.create({
    ...getThreadOwnerFilter(input),
    userId: owner.userId,
    subject: normalizeSubject(input.subject, input.type),
    type: input.type,
    status: "open",
    references: input.references || [],
    artistLastReadAt: input.senderRole === "artist" ? now : null,
    teamLastReadAt: input.senderRole === "team" ? now : null,
    lastMessageAt: now,
    lastMessagePreview: truncatePreview(input.text, allowedMediaIds.length > 0),
    lastMessageSenderRole: input.senderRole,
  });

  const senderUserId =
    input.senderUserId != null
      ? typeof input.senderUserId === "string"
        ? new Types.ObjectId(input.senderUserId)
        : input.senderUserId
      : owner.userId;

  await ArtistWorkspaceMessageModel.create({
    threadId: thread._id,
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    senderRole: input.senderRole,
    senderUserId,
    senderLabel: input.senderLabel || (input.senderRole === "artist" ? "Artist" : "ARTCLUB Team"),
    text: input.text,
    mediaIds: allowedMediaIds,
  });

  return getWorkspaceConversationDetail({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    threadId: thread._id.toString(),
    viewerRole: input.senderRole,
    mediaUrlResolver: input.mediaUrlResolver,
  });
}

export async function sendWorkspaceMessage(input: {
  shopDomain: string;
  artistKey: string;
  threadId: string;
  senderRole: WorkspaceSenderRole;
  senderUserId?: Types.ObjectId | string | null;
  senderLabel?: string;
  text: string;
  mediaIds?: string[];
  mediaUrlResolver?: MediaUrlResolver;
}) {
  await connectMongo();
  await ensureArtistWorkspaceThreadIndexes();

  if (!Types.ObjectId.isValid(input.threadId)) {
    throw new Error("invalid_thread_id");
  }

  const thread = await ArtistWorkspaceThreadModel.findOne({
    _id: new Types.ObjectId(input.threadId),
    ...getThreadOwnerFilter(input),
  });
  if (!thread) {
    throw new Error("conversation_not_found");
  }

  const allowedMediaIds = await resolveAllowedMediaIds({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    mediaIds: input.mediaIds || [],
  });
  const now = new Date();

  const senderUserId =
    input.senderUserId != null
      ? typeof input.senderUserId === "string"
        ? new Types.ObjectId(input.senderUserId)
        : input.senderUserId
      : thread.userId;

  await ArtistWorkspaceMessageModel.create({
    threadId: thread._id,
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    senderRole: input.senderRole,
    senderUserId,
    senderLabel: input.senderLabel || (input.senderRole === "artist" ? "Artist" : "ARTCLUB Team"),
    text: input.text,
    mediaIds: allowedMediaIds,
  });

  thread.lastMessageAt = now;
  thread.lastMessagePreview = truncatePreview(input.text, allowedMediaIds.length > 0);
  thread.lastMessageSenderRole = input.senderRole;
  thread.status = "open";
  thread.archivedAt = undefined;
  thread.set(getViewerReadField(input.senderRole), now);
  await thread.save();

  return getWorkspaceConversationDetail({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    threadId: thread._id.toString(),
    viewerRole: input.senderRole,
    mediaUrlResolver: input.mediaUrlResolver,
  });
}

export async function markWorkspaceConversationRead(input: {
  shopDomain: string;
  artistKey: string;
  threadId: string;
  viewerRole: WorkspaceSenderRole;
}) {
  await connectMongo();
  await ensureArtistWorkspaceThreadIndexes();

  if (!Types.ObjectId.isValid(input.threadId)) return null;

  const now = new Date();
  const thread = await ArtistWorkspaceThreadModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(input.threadId),
      ...getThreadOwnerFilter(input),
    },
    { $set: { [getViewerReadField(input.viewerRole)]: now } },
    { new: true },
  ).lean();

  if (!thread) return null;
  return toConversationSummary(thread, input.viewerRole);
}

export async function getOrCreateGeneralConversation(input: {
  shopDomain: string;
  artistKey: string;
  userId?: Types.ObjectId | string | null;
  viewerRole: WorkspaceSenderRole;
  mediaUrlResolver?: MediaUrlResolver;
}) {
  await connectMongo();
  await ensureArtistWorkspaceThreadIndexes();

  let thread = await ArtistWorkspaceThreadModel.findOne({
    ...getThreadOwnerFilter(input),
    type: "general",
    status: "open",
  })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  if (!thread) {
    const owner =
      input.userId != null
        ? { userId: typeof input.userId === "string" ? new Types.ObjectId(input.userId) : input.userId }
        : await resolveWorkspaceOwnerByArtistKeys({
            shopDomain: input.shopDomain,
            artistKey: input.artistKey,
          });

    if (!owner?.userId) return null;

    const createdThread = await ArtistWorkspaceThreadModel.create({
      ...getThreadOwnerFilter(input),
      userId: owner.userId,
      subject: "General",
      type: "general",
      status: "open",
      lastMessageAt: null,
      lastMessagePreview: "",
      lastMessageSenderRole: undefined,
      artistLastReadAt: undefined,
      teamLastReadAt: undefined,
    });

    thread = createdThread.toObject();
  }

  return getWorkspaceConversationDetail({
    shopDomain: input.shopDomain,
    artistKey: input.artistKey,
    threadId: thread._id.toString(),
    viewerRole: input.viewerRole,
    mediaUrlResolver: input.mediaUrlResolver,
  });
}
