import { InferSchemaType, Model, Schema, model, models } from "mongoose";

function currentSettingsEnvironment() {
  return (process.env.VERCEL_ENV || process.env.NODE_ENV || "development").trim() || "development";
}

const posSettingsSchema = new Schema(
  {
    scope: { type: String, required: true, trim: true, default: "default" },
    environment: { type: String, required: true, trim: true, default: currentSettingsEnvironment },
    brandName: { type: String, required: true, trim: true, default: "ARTCLUB" },
    logoUrl: { type: String, trim: true },
    seller: {
      companyName: { type: String, required: true, trim: true, default: "Artclub Mixed Media GmbH" },
      addressLine1: { type: String, required: true, trim: true, default: "Friedrichsruher Straße 37" },
      addressLine2: { type: String, required: true, trim: true, default: "14193 Berlin" },
      email: { type: String, required: true, trim: true, default: "support@artclub.wtf" },
      phone: { type: String, required: true, trim: true, default: "+49 176 41534464" },
    },
    tax: {
      steuernummer: { type: String, trim: true },
      ustId: { type: String, trim: true },
      finanzamt: { type: String, trim: true },
    },
    receiptFooterLines: { type: [String], default: ["Vielen Dank fuer Ihren Einkauf.", "Thank you for your purchase."] },
    locale: { type: String, required: true, trim: true, default: "de-DE" },
    currency: { type: String, required: true, trim: true, uppercase: true, default: "EUR" },
  },
  { timestamps: true, collection: "pos_settings" },
);

posSettingsSchema.index({ scope: 1, environment: 1 }, { unique: true });

type PosSettings = InferSchemaType<typeof posSettingsSchema>;

export const POSSettingsModel =
  (models.POSSettings as Model<PosSettings>) || model<PosSettings>("POSSettings", posSettingsSchema);
export const PosSettingsModel = POSSettingsModel;

export const POS_SETTINGS_SCOPE = "default";
export { currentSettingsEnvironment };

export type { PosSettings };
