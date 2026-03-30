export type ArtistShopifySyncMode = "minimal" | "legacy";

export function getArtistShopifySyncMode(): ArtistShopifySyncMode {
  const raw = (process.env.ARTIST_SHOPIFY_SYNC_MODE || "").trim().toLowerCase();
  if (raw === "minimal" || raw === "legacy") return raw;

  // Requirement: default to minimal in production.
  if (process.env.NODE_ENV === "production") return "minimal";

  return "legacy";
}

export function isArtistShopifySyncMinimalMode() {
  return getArtistShopifySyncMode() === "minimal";
}
