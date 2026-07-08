import mongoose from "mongoose";

const mongoUrl = process.env.MONGODB_URI;
if (!mongoUrl) throw new Error("MONGODB_URI is required");
const requested = process.argv.filter(value => value.startsWith("--artist=")).map(value => value.slice("--artist=".length).trim()).filter(Boolean);
const names = requested.length ? requested : ["Tjorven Kowalski", "JONAH"];

await mongoose.connect(mongoUrl);
const db = mongoose.connection.db;
const artists = db.collection("canonicalartists");
const products = db.collection("canonicalproducts");
const results = [];

for (const name of names) {
  const artist = await artists.findOne({ displayName: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  if (!artist) { results.push({ requestedName: name, found: false }); continue; }
  const refs = [artist.shopifyMetaobjectId, artist.shopify?.metaobjectGid].filter(Boolean);
  const canonicalProducts = await products.find({ canonicalArtistId: artist._id, type: "artwork" }, { projection: { title: 1, status: 1, approvalStatus: 1, artistRef: 1 } }).toArray();
  const referencedProducts = refs.length ? await products.find({ artistRef: { $in: refs }, type: "artwork" }, { projection: { title: 1, status: 1, approvalStatus: 1, canonicalArtistId: 1, artistRef: 1 } }).toArray() : [];
  const mismatches = referencedProducts.filter(product => String(product.canonicalArtistId || "") !== String(artist._id));
  results.push({ requestedName: name, found: true, canonicalArtistId: String(artist._id), artistKey: artist.artistKey, shopifyReferenceCount: refs.length, canonicalArtworkCount: canonicalProducts.length, publicArtworkCount: canonicalProducts.filter(product => ["active", "shopify_synced"].includes(product.status) && ["published", "approved"].includes(product.approvalStatus)).length, referencedArtworkCount: referencedProducts.length, mismatchCount: mismatches.length, mismatches: mismatches.map(product => ({ id: String(product._id), title: product.title || "", canonicalArtistId: product.canonicalArtistId ? String(product.canonicalArtistId) : null })) });
}

console.log(JSON.stringify({ results }, null, 2));
await mongoose.disconnect();
