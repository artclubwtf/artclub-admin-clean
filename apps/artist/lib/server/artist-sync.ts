type DirtySyncInput = {
  currentDirtyFields?: string[];
  changedFields: string[];
  now?: Date;
};

export type ArtistShopifySyncMode = "minimal" | "legacy";

export function getArtistShopifySyncMode(): ArtistShopifySyncMode {
  const raw = (process.env.ARTIST_SHOPIFY_SYNC_MODE || "").trim().toLowerCase();
  if (raw === "minimal" || raw === "legacy") return raw;
  if (process.env.NODE_ENV === "production") return "minimal";
  return "legacy";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function buildArtistSyncPatch(input: DirtySyncInput) {
  const now = input.now || new Date();
  const mode = getArtistShopifySyncMode();
  const legacyFields = unique(input.changedFields);
  const minimalFields = legacyFields.filter((field) => field === "handle" || field === "displayName");
  const relevant = mode === "legacy" ? legacyFields : minimalFields;

  if (!relevant.length) return {};

  return {
    "sync.needsPush": true,
    "sync.dirtyAt": now,
    "sync.dirtyFields": unique([...(input.currentDirtyFields || []), ...relevant]),
  };
}

export function buildProductSyncPatch(input: DirtySyncInput & { status?: string; hasShopifyProduct?: boolean }) {
  return {
    "sync.needsPush": true,
    "sync.dirtyAt": input.now || new Date(),
    "sync.dirtyFields": unique([...(input.currentDirtyFields || []), ...input.changedFields]),
  };
}
