import { ArtistWorkspaceThreadModel } from "../models/ArtistWorkspaceThread";

let artistWorkspaceThreadIndexPromise: Promise<void> | null = null;

function readIndexDirection(value: unknown) {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
}

function isLegacyOwnerIndex(index: { key?: Record<string, unknown> } | null | undefined) {
  return readIndexDirection(index?.key?.shopDomain) === 1 && readIndexDirection(index?.key?.artistKey) === 1;
}

function isExpectedOwnerIndex(index: {
  key?: Record<string, unknown>;
  unique?: boolean;
  name?: string;
} | null | undefined) {
  return (
    index?.name === "artistWorkspaceThread_owner_lastMessageAt" &&
    !index.unique &&
    readIndexDirection(index?.key?.shopDomain) === 1 &&
    readIndexDirection(index?.key?.artistKey) === 1 &&
    readIndexDirection(index?.key?.lastMessageAt) === -1 &&
    readIndexDirection(index?.key?.createdAt) === -1
  );
}

function isExpectedTypeStatusIndex(index: {
  key?: Record<string, unknown>;
  name?: string;
} | null | undefined) {
  return (
    index?.name === "artistWorkspaceThread_owner_type_status" &&
    readIndexDirection(index?.key?.shopDomain) === 1 &&
    readIndexDirection(index?.key?.artistKey) === 1 &&
    readIndexDirection(index?.key?.type) === 1 &&
    readIndexDirection(index?.key?.status) === 1 &&
    readIndexDirection(index?.key?.lastMessageAt) === -1
  );
}

async function dropIndexIfExists(name: string) {
  await ArtistWorkspaceThreadModel.collection.dropIndex(name).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("index not found")) {
      return;
    }
    throw error;
  });
}

export async function ensureArtistWorkspaceThreadIndexes() {
  if (artistWorkspaceThreadIndexPromise) return artistWorkspaceThreadIndexPromise;

  artistWorkspaceThreadIndexPromise = (async () => {
    const indexes = await ArtistWorkspaceThreadModel.collection.indexes();
    const legacyOwnerIndex = indexes.find((index) => isLegacyOwnerIndex(index));
    const ownerIndex = indexes.find((index) => isExpectedOwnerIndex(index));
    const typeStatusIndex = indexes.find((index) => isExpectedTypeStatusIndex(index));

    if (legacyOwnerIndex?.unique || !ownerIndex) {
      if (legacyOwnerIndex?.name) {
        await dropIndexIfExists(legacyOwnerIndex.name);
      }
      await ArtistWorkspaceThreadModel.collection.createIndex(
        { shopDomain: 1, artistKey: 1, lastMessageAt: -1, createdAt: -1 },
        { name: "artistWorkspaceThread_owner_lastMessageAt" },
      );
    }

    if (!typeStatusIndex) {
      await dropIndexIfExists("artistWorkspaceThread_owner_type_status");
      await ArtistWorkspaceThreadModel.collection.createIndex(
        { shopDomain: 1, artistKey: 1, type: 1, status: 1, lastMessageAt: -1 },
        { name: "artistWorkspaceThread_owner_type_status" },
      );
    }
  })().catch((error) => {
    artistWorkspaceThreadIndexPromise = null;
    throw error;
  });

  return artistWorkspaceThreadIndexPromise;
}
