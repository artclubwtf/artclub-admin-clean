import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const canonicalArtistProfileImagesSchema = new Schema(
  {
    avatarUrl: { type: String },
    heroUrl: { type: String },
    galleryUrls: { type: [String], default: [] },
  },
  { _id: false },
);

const canonicalArtistConsentsSchema = new Schema(
  {
    allowOriginalSales: { type: Boolean, default: false },
    allowPrintSales: { type: Boolean, default: false },
    allowRental: { type: Boolean, default: false },
    allowExhibitions: { type: Boolean, default: false },
    presentationOnly: { type: Boolean, default: false },
  },
  { _id: false },
);

const canonicalArtistShopifySchema = new Schema(
  {
    metaobjectGid: { type: String },
    lastPulledAt: { type: Date },
    lastPushedAt: { type: Date },
  },
  { _id: false },
);

const canonicalArtistSyncSchema = new Schema(
  {
    dirtyFields: { type: [String], default: [] },
    dirtyAt: { type: Date },
    needsPush: { type: Boolean, default: false },
  },
  { _id: false },
);

const canonicalArtistSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    handle: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    instagram: { type: String, trim: true },
    profileImages: { type: canonicalArtistProfileImagesSchema, default: () => ({ galleryUrls: [] }) },
    consents: { type: canonicalArtistConsentsSchema, default: () => ({}) },
    shopify: { type: canonicalArtistShopifySchema, default: () => ({}) },
    sync: { type: canonicalArtistSyncSchema, default: () => ({ dirtyFields: [] }) },
  },
  { timestamps: true },
);

canonicalArtistSchema.index({ shopDomain: 1, artistKey: 1 }, { unique: true });
canonicalArtistSchema.index({ shopDomain: 1, "shopify.metaobjectGid": 1 }, { unique: true, sparse: true });
canonicalArtistSchema.index({ shopDomain: 1, "sync.needsPush": 1, "sync.dirtyAt": 1 });

type CanonicalArtist = InferSchemaType<typeof canonicalArtistSchema>;

export const CanonicalArtistModel =
  (models.CanonicalArtist as Model<CanonicalArtist>) ||
  model<CanonicalArtist>("CanonicalArtist", canonicalArtistSchema);

export type { CanonicalArtist };
