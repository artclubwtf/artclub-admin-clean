export function isArtistsV3Enabled() {
  const raw = (process.env.ARTISTS_V3_ENABLED || "").trim().toLowerCase();
  if (!raw) return true;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isArtistsV2Enabled() {
  const raw = (process.env.ARTISTS_V2_ENABLED || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
