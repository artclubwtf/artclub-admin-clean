import { CanonicalProductModel } from "@/lib/server/models";

let canonicalProductIndexPromise: Promise<void> | null = null;

function readIndexDirection(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
}

function isTargetIndex(index: { key?: Record<string, unknown> } | null | undefined) {
  return readIndexDirection(index?.key?.shopDomain) === 1 && readIndexDirection(index?.key?.["shopify.productGid"]) === 1;
}

function hasExpectedPartialFilter(index: {
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
} | null | undefined) {
  if (!index?.unique || !index.partialFilterExpression) return false;
  const productGidFilter = index.partialFilterExpression["shopify.productGid"];
  return Boolean(
    productGidFilter &&
      typeof productGidFilter === "object" &&
      "$type" in productGidFilter &&
      (productGidFilter as { $type?: unknown }).$type === "string",
  );
}

export async function ensureCanonicalProductIndexes() {
  if (canonicalProductIndexPromise) return canonicalProductIndexPromise;

  canonicalProductIndexPromise = (async () => {
    const indexes = await CanonicalProductModel.collection.indexes();
    const existing = indexes.find((index) => isTargetIndex(index));
    if (hasExpectedPartialFilter(existing)) {
      return;
    }

    if (existing?.name) {
      await CanonicalProductModel.collection.dropIndex(existing.name).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("index not found")) {
          return;
        }
        throw error;
      });
    }

    await CanonicalProductModel.collection.createIndex(
      { shopDomain: 1, "shopify.productGid": 1 },
      {
        name: "shopDomain_1_shopify.productGid_1",
        unique: true,
        partialFilterExpression: {
          "shopify.productGid": { $type: "string" },
        },
      },
    );
  })().catch((error) => {
    canonicalProductIndexPromise = null;
    throw error;
  });

  return canonicalProductIndexPromise;
}
