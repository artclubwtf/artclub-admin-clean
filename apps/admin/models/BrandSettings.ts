import { InferSchemaType, Model, Schema, model, models } from "mongoose";

export const brandKeys = ["artclub", "alea"] as const;

const brandColorsSchema = new Schema(
  {
    accent: { type: String },
    background: { type: String },
    text: { type: String },
  },
  { _id: false },
);

const brandTypographySchema = new Schema(
  {
    fontFamily: { type: String },
  },
  { _id: false },
);

const brandSettingsSchema = new Schema(
  {
    key: { type: String, enum: brandKeys, required: true, unique: true },
    displayName: { type: String, required: true },
    tone: { type: String, required: true },
    about: { type: String, required: true },
    defaultOfferBullets: { type: [String], default: [] },
    logoLightUrl: { type: String },
    logoDarkUrl: { type: String },
    colors: brandColorsSchema,
    typography: brandTypographySchema,
  },
  { timestamps: true },
);

type BrandSettings = InferSchemaType<typeof brandSettingsSchema>;

export const BrandSettingsModel =
  (models.BrandSettings as Model<BrandSettings>) ||
  model<BrandSettings>("BrandSettings", brandSettingsSchema);

export type { BrandSettings };
