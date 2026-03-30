import { InferSchemaType, Model, Schema, model, models, Types } from "mongoose";

const artistRegistrationKeySchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    usedByUserId: { type: Types.ObjectId, ref: "User" },
    createdByAdminId: { type: Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

artistRegistrationKeySchema.index({ code: 1 }, { unique: true });
artistRegistrationKeySchema.index({ expiresAt: 1 });
artistRegistrationKeySchema.index({ usedAt: 1 });
artistRegistrationKeySchema.index({ createdByAdminId: 1, createdAt: -1 });

type ArtistRegistrationKey = InferSchemaType<typeof artistRegistrationKeySchema>;

export const ArtistRegistrationKeyModel =
  (models.ArtistRegistrationKey as Model<ArtistRegistrationKey>) ||
  model<ArtistRegistrationKey>("ArtistRegistrationKey", artistRegistrationKeySchema);

export type { ArtistRegistrationKey };
