export type ArtistPrintSize = {
  code: string;
  label: string;
  widthCm: number;
  heightCm: number;
};

export const ARTIST_PRINT_SIZES: ArtistPrintSize[] = [
  { code: "S_30X40", label: "30 x 40 cm", widthCm: 30, heightCm: 40 },
  { code: "M_40X50", label: "40 x 50 cm", widthCm: 40, heightCm: 50 },
  { code: "L_50X70", label: "50 x 70 cm", widthCm: 50, heightCm: 70 },
  { code: "XL_60X80", label: "60 x 80 cm", widthCm: 60, heightCm: 80 },
  { code: "XXL_70X100", label: "70 x 100 cm", widthCm: 70, heightCm: 100 },
];

const PRINT_BASE_PRICE_CENTS = 2400;
const PRINT_AREA_FACTOR_CENTS = 4.5;
const PRINT_ROUNDING_STEP_CENTS = 100;

function roundPriceCents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / PRINT_ROUNDING_STEP_CENTS) * PRINT_ROUNDING_STEP_CENTS;
}

export function getArtistPrintSizeByCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return ARTIST_PRINT_SIZES.find((item) => item.code === normalized);
}

export function calculatePrintPriceCents(input: {
  widthCm: number;
  heightCm: number;
  originalPriceCents?: number;
}) {
  const width = Math.max(0, Number.isFinite(input.widthCm) ? input.widthCm : 0);
  const height = Math.max(0, Number.isFinite(input.heightCm) ? input.heightCm : 0);
  const areaBased = PRINT_BASE_PRICE_CENTS + width * height * PRINT_AREA_FACTOR_CENTS;

  if (!Number.isFinite(input.originalPriceCents) || (input.originalPriceCents ?? 0) <= 0) {
    return roundPriceCents(areaBased);
  }

  const originalPriceCents = Math.max(0, input.originalPriceCents ?? 0);
  const ceilingFromOriginal = originalPriceCents * 0.4;
  const bounded = Math.min(areaBased, ceilingFromOriginal);
  return Math.max(1500, roundPriceCents(bounded));
}
