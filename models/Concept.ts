import { InferSchemaType, Model, Schema, model, models } from "mongoose";

import { brandKeys } from "./BrandSettings";

export const conceptTypes = ["sponsoring", "leasing", "event"] as const;
export const conceptStatuses = [
  "draft",
  "internal_review",
  "ready_to_send",
  "sent",
  "won",
  "lost",
] as const;
export const conceptGranularities = ["short", "standard", "detailed"] as const;
export const conceptReferenceSources = ["mongo", "shopify"] as const;
export const conceptAssetKinds = ["s3", "shopify_file", "url"] as const;
export const conceptExportProviders = ["local", "openai"] as const;

export const conceptSectionsSchema = new Schema(
  {
    goalContext: { type: String },
    targetAudience: { type: String },
    narrative: { type: String },
    kpis: { type: String },
    legal: { type: String },
    extra: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const conceptArtistReferenceSchema = new Schema(
  {
    source: { type: String, enum: conceptReferenceSources, required: true },
    id: { type: String, required: true },
    label: { type: String },
  },
  { _id: false },
);

const conceptArtworkReferenceSchema = new Schema(
  {
    productId: { type: String, required: true },
    label: { type: String },
  },
  { _id: false },
);

const conceptCollectionReferenceSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String },
  },
  { _id: false },
);

export const conceptReferencesSchema = new Schema(
  {
    artists: { type: [conceptArtistReferenceSchema], default: [] },
    artworks: { type: [conceptArtworkReferenceSchema], default: [] },
    collections: { type: [conceptCollectionReferenceSchema], default: [] },
  },
  { _id: false },
);

export const conceptAssetSchema = new Schema(
  {
    kind: { type: String, enum: conceptAssetKinds, required: true },
    id: { type: String },
    url: { type: String },
    mimeType: { type: String },
    label: { type: String },
    previewUrl: { type: String },
  },
  { _id: false },
);

export const conceptExportsSchema = new Schema(
  {
    proposalMarkdown: { type: String },
    emailDraftText: { type: String },
    lastGeneratedAt: { type: String },
    provider: { type: String, enum: conceptExportProviders },
  },
  { _id: false },
);

const conceptSchema = new Schema(
  {
    title: { type: String, required: true },
    brandKey: { type: String, enum: brandKeys, required: true },
    type: { type: String, enum: conceptTypes, required: true },
    status: { type: String, enum: conceptStatuses, required: true },
    granularity: { type: String, enum: conceptGranularities, required: true },
    sections: { type: conceptSectionsSchema, default: {} },
    references: { type: conceptReferencesSchema, default: {} },
    assets: { type: [conceptAssetSchema], default: [] },
    exports: { type: conceptExportsSchema, default: {} },
    notes: { type: String },
    statusChangedAt: { type: Map, of: String },
  },
  { timestamps: true },
);

type Concept = InferSchemaType<typeof conceptSchema>;

export const ConceptModel = (models.Concept as Model<Concept>) || model<Concept>("Concept", conceptSchema);
export type { Concept };
