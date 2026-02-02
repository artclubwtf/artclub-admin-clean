import { brandKeys } from "@/models/BrandSettings";

export type BrandPayload = {
  key?: string;
  displayName?: string;
  tone?: string;
  about?: string;
  defaultOfferBullets?: string[];
  logoLightUrl?: string;
  logoDarkUrl?: string;
  colors?: { accent?: string; background?: string; text?: string };
  typography?: { fontFamily?: string };
};

export const defaultBrandSeeds: BrandPayload[] = [
  {
    key: "artclub",
    displayName: "ARTCLUB",
    tone: "Contemporary and approachable.",
    about: "Default profile for ARTCLUB brand settings.",
    defaultOfferBullets: ["Curated art experiences", "Flexible collaborations"],
  },
  {
    key: "alea",
    displayName: "ALÉA",
    tone: "Bold and experimental.",
    about: "Default profile for ALÉA brand settings.",
    defaultOfferBullets: ["Immersive brand moments", "Artist-led concepts"],
  },
];

function sanitizeString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  return items.length ? items : [];
}

function sanitizeNestedColors(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const { accent, background, text } = value as Record<string, unknown>;
  const colors = {
    accent: sanitizeString(accent),
    background: sanitizeString(background),
    text: sanitizeString(text),
  };
  return Object.values(colors).some(Boolean) ? colors : undefined;
}

function sanitizeTypography(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const { fontFamily } = value as Record<string, unknown>;
  const typography = { fontFamily: sanitizeString(fontFamily) };
  return typography.fontFamily ? typography : undefined;
}

export function normalizeBrandKey(raw: unknown) {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  return brandKeys.includes(key as (typeof brandKeys)[number]) ? key : null;
}

export function extractBrandUpdate(body: BrandPayload) {
  const update: BrandPayload = {};
  const displayName = sanitizeString(body.displayName);
  const tone = sanitizeString(body.tone);
  const about = sanitizeString(body.about);
  const defaultOfferBullets = sanitizeStringArray(body.defaultOfferBullets);
  const logoLightUrl = sanitizeString(body.logoLightUrl);
  const logoDarkUrl = sanitizeString(body.logoDarkUrl);
  const colors = sanitizeNestedColors(body.colors);
  const typography = sanitizeTypography(body.typography);

  if (displayName) update.displayName = displayName;
  if (tone) update.tone = tone;
  if (about) update.about = about;
  if (defaultOfferBullets) update.defaultOfferBullets = defaultOfferBullets;
  if (logoLightUrl) update.logoLightUrl = logoLightUrl;
  if (logoDarkUrl) update.logoDarkUrl = logoDarkUrl;
  if (colors) update.colors = colors;
  if (typography) update.typography = typography;

  return update;
}
