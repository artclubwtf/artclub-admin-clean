import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { canonicalStatusValues } from "./canonicalStates";

const canonicalArtistAccountStatusValues = ["unlinked", "onboarding_pending", "provisioned", "linked", "disabled"] as const;

const canonicalArtistProfileImagesSchema = new Schema(
  {
    avatarUrl: { type: String },
    heroUrl: { type: String },
    galleryUrls: { type: [String], default: [] },
    media: {
      type: [
        new Schema(
          {
            fieldKey: { type: String, trim: true },
            url: { type: String, trim: true },
            altText: { type: String, trim: true },
            shopifyFileGid: { type: String, trim: true },
            mediaGid: { type: String, trim: true },
            width: { type: Number },
            height: { type: Number },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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

const canonicalArtistExperienceSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true },
    employmentType: { type: String, trim: true },
    location: { type: String, trim: true },
    locationType: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    isCurrent: { type: Boolean, default: false },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

const canonicalArtistEducationSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    school: { type: String, required: true, trim: true },
    degree: { type: String, trim: true },
    fieldOfStudy: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    grade: { type: String, trim: true },
    activities: { type: String, trim: true },
    description: { type: String, trim: true },
    courses: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

const canonicalArtistExhibitionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    venue: { type: String, required: true, trim: true },
    exhibitionType: { type: String, trim: true },
    city: { type: String, trim: true },
    country: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    isOngoing: { type: Boolean, default: false },
    description: { type: String, trim: true },
    link: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    visibility: { type: String, enum: ["public", "private"], default: "public" },
  },
  { _id: false },
);

const canonicalArtistProfileLinkSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    type: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true },
    isHighlighted: { type: Boolean, default: false },
  },
  { _id: false },
);

const canonicalArtistPublicProfileSchema = new Schema(
  {
    isVisible: { type: Boolean, default: true },
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
    status: { type: String, trim: true },
    dirtyFields: { type: [String], default: [] },
    dirtyAt: { type: Date },
    needsPush: { type: Boolean, default: false },
    lastPushAt: { type: Date },
    lastPullAt: { type: Date },
    lastError: { type: String },
  },
  { _id: false },
);

const canonicalArtistSchema = new Schema(
  {
    shopDomain: { type: String, required: true, lowercase: true, trim: true },
    artistKey: { type: String, required: true, trim: true },
    handle: { type: String, required: true, trim: true },
    publicSlug: { type: String, trim: true },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    appUrl: { type: String, trim: true },
    locationCity: { type: String, trim: true },
    locationCountry: { type: String, trim: true },
    bio: { type: String, trim: true },
    quote: { type: String, trim: true },
    introduction: { type: String, trim: true },
    longText: { type: String },
    categoryRef: { type: String, trim: true },
    websiteUrl: { type: String, trim: true },
    instagram: { type: String, trim: true },
    shopifyMetaobjectId: { type: String, trim: true },
    legacyArtistId: { type: String, trim: true },
    migrationStatus: { type: String, enum: canonicalStatusValues },
    linkStatus: { type: String, enum: canonicalStatusValues },
    accountStatus: { type: String, enum: canonicalArtistAccountStatusValues },
    linkedUserId: { type: Schema.Types.ObjectId, ref: "User" },
    profileImages: { type: canonicalArtistProfileImagesSchema, default: () => ({ galleryUrls: [] }) },
    consents: { type: canonicalArtistConsentsSchema, default: () => ({}) },
    experience: { type: [canonicalArtistExperienceSchema], default: [] },
    education: { type: [canonicalArtistEducationSchema], default: [] },
    exhibitions: { type: [canonicalArtistExhibitionSchema], default: [] },
    profileLinks: { type: [canonicalArtistProfileLinkSchema], default: [] },
    publicProfile: { type: canonicalArtistPublicProfileSchema, default: () => ({ isVisible: true }) },
    shopify: { type: canonicalArtistShopifySchema, default: () => ({}) },
    sync: { type: canonicalArtistSyncSchema, default: () => ({ dirtyFields: [] }) },
  },
  { timestamps: true },
);

canonicalArtistSchema.index({ shopDomain: 1, artistKey: 1 }, { unique: true });
canonicalArtistSchema.index(
  { shopDomain: 1, publicSlug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      publicSlug: { $type: "string" },
    },
  },
);
canonicalArtistSchema.index(
  { shopDomain: 1, shopifyMetaobjectId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      shopifyMetaobjectId: { $type: "string" },
    },
  },
);
canonicalArtistSchema.index(
  { shopDomain: 1, "shopify.metaobjectGid": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "shopify.metaobjectGid": { $type: "string" },
    },
  },
);
canonicalArtistSchema.index({ shopDomain: 1, "sync.needsPush": 1, "sync.dirtyAt": 1 });
canonicalArtistSchema.index({ shopDomain: 1, legacyArtistId: 1 });
canonicalArtistSchema.index({ shopDomain: 1, linkedUserId: 1 });

type CanonicalArtist = InferSchemaType<typeof canonicalArtistSchema>;

export const CanonicalArtistModel =
  (models.CanonicalArtist as Model<CanonicalArtist>) ||
  model<CanonicalArtist>("CanonicalArtist", canonicalArtistSchema);

export type { CanonicalArtist };
