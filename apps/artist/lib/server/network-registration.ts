import type { ClientSession, Connection } from "mongoose";
import { profileIdentityCandidate } from "@artclub/models";
import { NetworkProfileModel } from "@/lib/server/models";

export async function uniqueProfileIdentity(name: string, session?: ClientSession, excludeUserId?: unknown) {
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const candidate = profileIdentityCandidate(name, suffix);
    const filter: any = { $or: [{ slug: candidate }, { username: candidate }], ...(excludeUserId ? { userId: { $ne: excludeUserId } } : {}) };
    const exists = await NetworkProfileModel.exists(filter).session(session || null);
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
