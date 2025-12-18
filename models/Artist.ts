import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { z } from "zod";

export const artistStages = ["Idea", "In Review", "Offer", "Under Contract"] as const;

export const createArtistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  stage: z.enum(artistStages).optional(),
  internalNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateArtistSchema = createArtistSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

const artistSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    stage: { type: String, enum: artistStages, default: "Idea" },
    internalNotes: { type: String, default: "" },
    tags: { type: [String], default: [] },
    shopifySync: {
      metaobjectId: { type: String },
      handle: { type: String },
      lastSyncedAt: { type: Date },
      lastSyncStatus: { type: String, enum: ["idle", "ok", "error"], default: "idle" },
      lastSyncError: { type: String },
    },
  },
  { timestamps: true },
);

type Artist = InferSchemaType<typeof artistSchema>;

export const ArtistModel = (models.Artist as Model<Artist>) || model<Artist>("Artist", artistSchema);
export type { Artist };
