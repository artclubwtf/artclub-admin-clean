import { InferSchemaType, Model, Schema, Types, model, models } from "mongoose";

import { brandKeys } from "./BrandSettings";
import {
  conceptAssetSchema,
  conceptExportsSchema,
  conceptGranularities,
  conceptReferencesSchema,
  conceptSectionsSchema,
  conceptStatuses,
  conceptTypes,
} from "./Concept";

const conceptSnapshotPayloadSchema = new Schema(
  {
    brandKey: { type: String, enum: brandKeys, required: true },
    type: { type: String, enum: conceptTypes, required: true },
    granularity: { type: String, enum: conceptGranularities, required: true },
    sections: { type: conceptSectionsSchema, default: {} },
    references: { type: conceptReferencesSchema, default: {} },
    assets: { type: [conceptAssetSchema], default: [] },
    exports: { type: conceptExportsSchema, default: {} },
  },
  { _id: false },
);

const conceptSnapshotSchema = new Schema(
  {
    conceptId: { type: Types.ObjectId, ref: "Concept", required: true },
    status: { type: String, enum: conceptStatuses, required: true },
    title: { type: String, required: true },
    payload: { type: conceptSnapshotPayloadSchema, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

type ConceptSnapshot = InferSchemaType<typeof conceptSnapshotSchema>;

export const ConceptSnapshotModel =
  (models.ConceptSnapshot as Model<ConceptSnapshot>) ||
  model<ConceptSnapshot>("ConceptSnapshot", conceptSnapshotSchema);

export type { ConceptSnapshot };
