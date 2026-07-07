import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mongoose from "mongoose";

const repair = process.argv.includes("--repair");
const checkObjects = process.argv.includes("--check-objects");
const mongoUrl = process.env.MONGODB_URI;
const appBase = (process.env.ARTIST_APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
const publicBase = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
if (!mongoUrl) throw new Error("MONGODB_URI is required");
if (repair && !publicBase && !appBase) throw new Error("ARTIST_APP_URL or NEXTAUTH_URL is required for --repair with private storage");

function classify(url) {
  if (!url) return "missing_url";
  if (/^blob:/i.test(url)) return "blob_url";
  if (/^file:|^\/tmp\/|\/public\/uploads\//i.test(url)) return "local_url";
  try {
    const parsed = new URL(url, appBase || "https://artclub.invalid");
    if (["x-amz-signature", "x-amz-expires", "expires", "signature"].some(key => parsed.searchParams.has(key))) return "expiring_url";
  } catch { return "invalid_url"; }
  return "ok";
}

function storageKey(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, appBase || "https://artclub.invalid");
    if (parsed.pathname.startsWith("/api/network/media/")) return decodeURIComponent(parsed.pathname.slice(19));
    if (publicBase && url.startsWith(`${publicBase}/`)) return decodeURIComponent(url.slice(publicBase.length + 1));
    if (/amazonaws\.com|digitaloceanspaces\.com|cloudfront\.net/i.test(parsed.hostname)) {
      const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      const bucket = process.env.S3_BUCKET || "";
      return bucket && path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
    }
  } catch {}
  return "";
}

function stableUrl(key) {
  if (!key) return "";
  if (publicBase) return `${publicBase}/${key}`;
  return `${appBase}/api/network/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

await mongoose.connect(mongoUrl);
const db = mongoose.connection.db;
const issues = [];
const keys = new Set();

async function inspectScalar(collectionName, urlField, keyField) {
  const collection = db.collection(collectionName);
  for await (const document of collection.find({ [urlField]: { $exists: true, $ne: "" } })) {
    const url = urlField.split(".").reduce((value, key) => value?.[key], document);
    const existingKey = keyField?.split(".").reduce((value, key) => value?.[key], document) || "";
    const recovered = existingKey || storageKey(url);
    if (recovered) keys.add(recovered);
    const reason = classify(url);
    if (reason !== "ok" || !recovered) issues.push({ collection: collectionName, id: String(document._id), field: urlField, reason: recovered ? reason : "missing_storage_key" });
    if (repair && recovered && (reason !== "ok" || !existingKey)) {
      const update = { [urlField]: stableUrl(recovered), ...(keyField ? { [keyField]: recovered } : {}) };
      await collection.updateOne({ _id: document._id }, { $set: update });
    }
  }
}

async function inspectMedia(collectionName) {
  const collection = db.collection(collectionName);
  for await (const document of collection.find({ "media.0": { $exists: true } })) {
    let changed = false;
    const media = (document.media || []).map((item, index) => {
      const recovered = item.storageKey || storageKey(item.url);
      if (recovered) keys.add(recovered);
      const reason = classify(item.url);
      if (reason !== "ok" || !recovered) issues.push({ collection: collectionName, id: String(document._id), field: `media.${index}.url`, reason: recovered ? reason : "missing_storage_key" });
      if (repair && recovered && (reason !== "ok" || !item.storageKey)) { changed = true; return { ...item, storageKey: recovered, provider: "s3", url: stableUrl(recovered) }; }
      return item;
    });
    if (changed) await collection.updateOne({ _id: document._id }, { $set: { media } });
  }
}

await inspectScalar("networkprofiles", "profileImageUrl", "profileImageStorageKey");
await inspectScalar("networkprofiles", "coverImageUrl", "coverImageStorageKey");
await inspectScalar("networkevents", "coverImageUrl", "coverImageStorageKey");
await inspectScalar("networkcollectionitems", "customImageUrl", "customImageStorageKey");
await inspectScalar("canonicalartists", "profileImages.avatarUrl");
await inspectScalar("canonicalartists", "profileImages.heroUrl");
await inspectMedia("networkposts");
await inspectMedia("networkmessages");

let missingObjects = 0;
if (checkObjects) {
  const required = [process.env.S3_REGION, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY, process.env.S3_BUCKET];
  if (required.some(value => !value)) throw new Error("S3 configuration is required for --check-objects");
  const client = new S3Client({ region: required[0], credentials: { accessKeyId: required[1], secretAccessKey: required[2] } });
  for (const key of keys) {
    try { await client.send(new HeadObjectCommand({ Bucket: required[3], Key: key })); }
    catch { missingObjects += 1; issues.push({ collection: "storage", id: key, field: "object", reason: "missing_object" }); }
  }
}

console.log(JSON.stringify({ mode: repair ? "repair" : "diagnostic", scannedStorageKeys: keys.size, issueCount: issues.length, missingObjects, issues }, null, 2));
await mongoose.disconnect();
