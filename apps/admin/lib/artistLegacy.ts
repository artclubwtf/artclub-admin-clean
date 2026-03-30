const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function isArtistLegacyEnabled(): boolean {
  const raw = process.env.ARTIST_LEGACY_ENABLED;
  if (typeof raw !== "string") return true;

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return true;
  return !FALSE_VALUES.has(normalized);
}
