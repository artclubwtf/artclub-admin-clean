import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const reactionsSchema = new Schema(
  {
    "🖤": { type: Number, default: 0 },
    "🔥": { type: Number, default: 0 },
    "👀": { type: Number, default: 0 },
    "😵‍💫": { type: Number, default: 0 },
  },
  { _id: false },
);

const artworkSignalsSchema = new Schema(
  {
    productGid: { type: String, required: true, unique: true },
    savesCount: { type: Number, default: 0 },
    reactions: { type: reactionsSchema, default: () => ({}) },
    viewsCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: "artwork_signals" },
);

artworkSignalsSchema.index({ savesCount: -1 });

type ArtworkSignals = InferSchemaType<typeof artworkSignalsSchema>;

export const ArtworkSignalsModel =
  (models.ArtworkSignals as Model<ArtworkSignals>) ||
  model<ArtworkSignals>("ArtworkSignals", artworkSignalsSchema);

export async function incrementSavesCount(productGid: string, delta = 1) {
  if (!productGid) return;
  const shouldUpsert = delta > 0;
  await ArtworkSignalsModel.updateOne(
    { productGid },
    {
      $setOnInsert: { productGid },
      $inc: { savesCount: delta },
    },
    { upsert: shouldUpsert, setDefaultsOnInsert: shouldUpsert },
  );
  if (delta < 0) {
    await ArtworkSignalsModel.updateOne(
      { productGid, savesCount: { $lt: 0 } },
      { $set: { savesCount: 0 } },
    );
  }
}

export type { ArtworkSignals };
