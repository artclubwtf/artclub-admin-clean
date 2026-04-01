import { CanonicalArtistModel } from "@/lib/server/models";

let canonicalArtistIndexPromise: Promise<void> | null = null;

function readIndexDirection(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
}

function isTargetIndex(index: { key?: Record<string, unknown> } | null | undefined) {
  return readIndexDirection(index?.key?.shopDomain) === 1 && readIndexDirection(index?.key?.["shopify.metaobjectGid"]) === 1;
}

function hasExpectedPartialFilter(index: {
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
} | null | undefined) {
  if (!index?.unique || !index.partialFilterExpression) return false;
  const metaobjectFilter = index.partialFilterExpression["shopify.metaobjectGid"];
  return Boolean(
    metaobjectFilter &&
      typeof metaobjectFilter === "object" &&
      "$type" in metaobjectFilter &&
      (metaobjectFilter as { $type?: unknown }).$type === "string",
  );
}

export async function ensureCanonicalArtistIndexes() {
  if (canonicalArtistIndexPromise) return canonicalArtistIndexPromise;

  canonicalArtistIndexPromise = (async () => {
    const indexes = await CanonicalArtistModel.collection.indexes();
    const existing = indexes.find((index) => isTargetIndex(index));
    if (hasExpectedPartialFilter(existing)) {
      return;
    }

    if (existing?.name) {
      await CanonicalArtistModel.collection.dropIndex(existing.name).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("index not found")) {
          return;
        }
        throw error;
      });
    }

    await CanonicalArtistModel.collection.createIndex(
      { shopDomain: 1, "shopify.metaobjectGid": 1 },
      {
        name: "shopDomain_1_shopify.metaobjectGid_1",
        unique: true,
        partialFilterExpression: {
          "shopify.metaobjectGid": { $type: "string" },
        },
      },
    );
  })().catch((error) => {
    canonicalArtistIndexPromise = null;
    throw error;
  });

  return canonicalArtistIndexPromise;
}
