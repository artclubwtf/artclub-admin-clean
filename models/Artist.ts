import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { z } from "zod";

const artistStatuses = ["lead", "onboarding", "active", "paused"] as const;

export const createArtistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional(),
  status: z.enum(artistStatuses).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const updateArtistSchema = createArtistSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided" });

const artistSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String },
    status: { type: String, enum: artistStatuses, default: "lead" },
    tags: { type: [String], default: [] },
    notes: { type: String },
  },
  { timestamps: true },
);

type Artist = InferSchemaType<typeof artistSchema>;

export const ArtistModel = (models.Artist as Model<Artist>) || model<Artist>("Artist", artistSchema);
export type { Artist };
