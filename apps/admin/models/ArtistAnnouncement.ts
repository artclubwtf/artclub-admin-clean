import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

const artistAnnouncementSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    userId: { type: Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    ctaLabel: { type: String, trim: true },
    ctaUrl: { type: String, trim: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
    isPinned: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

artistAnnouncementSchema.index({ shopDomain: 1, artistKey: 1, sortOrder: 1, createdAt: -1 });
artistAnnouncementSchema.index({ shopDomain: 1, artistKey: 1, isPublished: 1, startsAt: 1, endsAt: 1 });

type ArtistAnnouncement = InferSchemaType<typeof artistAnnouncementSchema>;

export const ArtistAnnouncementModel =
  (models.ArtistAnnouncement as Model<ArtistAnnouncement>) ||
  model<ArtistAnnouncement>("ArtistAnnouncement", artistAnnouncementSchema);

export type { ArtistAnnouncement };
