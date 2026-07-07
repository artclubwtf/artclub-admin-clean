import type { ClientSession, Connection } from "mongoose";
import { networkSlug } from "@artclub/models";
import { NetworkProfileModel } from "@/lib/server/models";

export type DuplicateKeyError = { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> };

export function duplicateKeyFields(error: DuplicateKeyError) {
  return Array.from(new Set([...Object.keys(error.keyPattern || {}), ...Object.keys(error.keyValue || {})]));
}

export function duplicateRegistrationError(error: DuplicateKeyError) {
  const fields = duplicateKeyFields(error);
  if (fields.includes("email")) return "email" as const;
  if (fields.includes("slug")) return "slug" as const;
  if (fields.includes("username")) return "username" as const;
  if (fields.includes("userId") || fields.includes("profileId")) return "identity" as const;
  if (fields.includes("registrationAttemptId")) return "attempt" as const;
  if (fields.includes("artistKey")) return "artistKey" as const;
  return "other" as const;
}

export function profileIdentityCandidate(name: string, suffix = 0) {
  const base = networkSlug(name);
  return suffix > 0 ? `${base.slice(0, Math.max(1, 60 - String(suffix + 1).length - 1))}-${suffix + 1}` : base;
}

export async function uniqueProfileIdentity(name: string, session?: ClientSession) {
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const candidate = profileIdentityCandidate(name, suffix);
    const exists = await NetworkProfileModel.exists({ $or: [{ slug: candidate }, { username: candidate }] }).session(session || null);
    if (!exists) return candidate;
  }
  return `${profileIdentityCandidate(name).slice(0, 51)}-${Date.now().toString(36)}`;
}

let indexMigration: Promise<void> | null = null;
export function ensureNetworkRegistrationIndexes(connection: Connection) {
  if (indexMigration) return indexMigration;
  indexMigration = (async () => {
    const collection = connection.collection("users");
    const indexes = await collection.indexes();
    const byName = new Map(indexes.map((index) => [index.name, index]));
    if (byName.has("email_1_shopDomain_1")) await collection.dropIndex("email_1_shopDomain_1").catch((error: any) => { if (error?.codeName !== "IndexNotFound") throw error; });
    const artistKey = byName.get("shopDomain_1_artistKey_1");
    if (artistKey && !artistKey.partialFilterExpression) await collection.dropIndex("shopDomain_1_artistKey_1").catch((error: any) => { if (error?.codeName !== "IndexNotFound") throw error; });
    await collection.createIndex({ shopDomain: 1, artistKey: 1 }, { name: "shopDomain_1_artistKey_1", unique: true, partialFilterExpression: { artistKey: { $type: "string" } } });
    await collection.createIndex({ registrationAttemptId: 1 }, { name: "registrationAttemptId_1", unique: true, partialFilterExpression: { registrationAttemptId: { $type: "string" } } });
  })().catch((error) => { indexMigration = null; throw error; });
  return indexMigration;
}
