export const SHOPIFY_VARIANT_OPTION_NAMES = {
  finish: "Finish",
  size: "Size",
} as const;

const FINISH_VALUE_BY_INTERNAL = {
  original: "Original",
  edition_art_print: "Edition Art Print",
  mounted_under_acrylic_glass: "Mounted under Acrylic Glas",
  floater_frame: "Floater Frame",
} as const;

const SIZE_VALUE_BY_INTERNAL = {
  ORIGINAL: "Original",
  PRINT_30X30: "30x30",
  PRINT_45X45: "45x45",
  PRINT_60X60: "60x60",
  PRINT_80X80: "80x80",
} as const;

function normalizeToken(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const FINISH_INTERNAL_BY_TOKEN = new Map<string, keyof typeof FINISH_VALUE_BY_INTERNAL>([
  ["original", "original"],
  ["edition art print", "edition_art_print"],
  ["edition_art_print", "edition_art_print"],
  ["mounted under acrylic glas", "mounted_under_acrylic_glass"],
  ["mounted under acrylic glass", "mounted_under_acrylic_glass"],
  ["mounted_under_acrylic_glass", "mounted_under_acrylic_glass"],
  ["floater frame", "floater_frame"],
  ["floater_frame", "floater_frame"],
]);

const SIZE_INTERNAL_BY_TOKEN = new Map<string, keyof typeof SIZE_VALUE_BY_INTERNAL>([
  ["original", "ORIGINAL"],
  ["30x30", "PRINT_30X30"],
  ["print 30x30", "PRINT_30X30"],
  ["print_30x30", "PRINT_30X30"],
  ["45x45", "PRINT_45X45"],
  ["print 45x45", "PRINT_45X45"],
  ["print_45x45", "PRINT_45X45"],
  ["60x60", "PRINT_60X60"],
  ["print 60x60", "PRINT_60X60"],
  ["print_60x60", "PRINT_60X60"],
  ["80x80", "PRINT_80X80"],
  ["print 80x80", "PRINT_80X80"],
  ["print_80x80", "PRINT_80X80"],
]);

export function normalizeFinishInternalCode(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return FINISH_INTERNAL_BY_TOKEN.get(normalizeToken(trimmed)) || trimmed;
}

export function normalizeSizeInternalCode(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return SIZE_INTERNAL_BY_TOKEN.get(normalizeToken(trimmed)) || trimmed;
}

export function toShopifyFinishValue(value?: string | null) {
  const internal = normalizeFinishInternalCode(value);
  return FINISH_VALUE_BY_INTERNAL[internal as keyof typeof FINISH_VALUE_BY_INTERNAL] || internal;
}

export function toShopifySizeValue(value?: string | null) {
  const internal = normalizeSizeInternalCode(value);
  return SIZE_VALUE_BY_INTERNAL[internal as keyof typeof SIZE_VALUE_BY_INTERNAL] || internal;
}

export function buildVariantOptionKey(finish?: string | null, sizeCode?: string | null) {
  return `${normalizeFinishInternalCode(finish)}::${normalizeSizeInternalCode(sizeCode)}`;
}
