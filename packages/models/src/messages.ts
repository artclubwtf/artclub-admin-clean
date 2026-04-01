import { z } from "zod";

export const workspaceConversationTypes = z.enum([
  "general",
  "support",
  "inquiry",
  "exhibition",
  "sales",
  "logistics",
  "request",
]);
export type WorkspaceConversationType = z.infer<typeof workspaceConversationTypes>;

export const workspaceConversationStatuses = z.enum(["open", "archived"]);
export type WorkspaceConversationStatus = z.infer<typeof workspaceConversationStatuses>;

export const workspaceConversationReferenceKinds = z.enum([
  "artwork",
  "exhibition",
  "request",
  "announcement",
  "sale",
  "logistics",
]);
export type WorkspaceConversationReferenceKind = z.infer<typeof workspaceConversationReferenceKinds>;

export const workspaceSenderRoles = z.enum(["artist", "team"]);
export type WorkspaceSenderRole = z.infer<typeof workspaceSenderRoles>;

export const workspaceConversationReferenceSchema = z
  .object({
    kind: workspaceConversationReferenceKinds,
    refId: z.string().trim().min(1).max(128),
    label: z.string().trim().max(160).optional(),
  })
  .strict();
export type WorkspaceConversationReferenceInput = z.infer<typeof workspaceConversationReferenceSchema>;

const conversationTextSchema = z.string().trim().max(5000);
const conversationMediaIdsSchema = z.array(z.string().trim().min(1).max(64)).max(12);

export const workspaceConversationCreateInputSchema = z
  .object({
    subject: z.string().trim().max(160).optional(),
    type: workspaceConversationTypes.default("general"),
    text: conversationTextSchema.optional(),
    mediaIds: conversationMediaIdsSchema.optional().default([]),
    references: z.array(workspaceConversationReferenceSchema).max(8).optional().default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.text && value.mediaIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message_requires_content",
        path: ["text"],
      });
    }
  });
export type WorkspaceConversationCreateInput = z.infer<typeof workspaceConversationCreateInputSchema>;

export const workspaceConversationMessageInputSchema = z
  .object({
    text: conversationTextSchema.optional(),
    mediaIds: conversationMediaIdsSchema.optional().default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.text && value.mediaIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message_requires_content",
        path: ["text"],
      });
    }
  });
export type WorkspaceConversationMessageInput = z.infer<typeof workspaceConversationMessageInputSchema>;

