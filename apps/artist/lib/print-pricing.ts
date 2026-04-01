export const PRINT_LONG_EDGES = [30, 45, 60, 80] as const;

export const PRINT_FINISHES = [
  {
    code: "edition_art_print",
    label: "Edition Art Print",
    k: 0.045,
    a: 24,
    end: 5,
  },
  {
    code: "mounted_under_acrylic_glass",
    label: "Mounted under Acrylic Glas",
    k: 0.075,
    a: 85,
    end: 5,
  },
  {
    code: "floater_frame",
    label: "Floater Frame",
    k: 0.095,
    a: 140,
    end: 5,
  },
] as const;

export type ArtistPrintFinish = (typeof PRINT_FINISHES)[number];
export type ArtistPrintFinishCode = ArtistPrintFinish["code"];

export type ArtistPrintSize = {
  code: string;
  label: string;
  widthCm: number;
  heightCm: number;
  longEdgeCm: number;
};

const LEGACY_STATIC_PRINT_SIZES = [
  { code: "S_30X40", widthCm: 30, heightCm: 40 },
  { code: "M_40X50", widthCm: 40, heightCm: 50 },
  { code: "L_50X70", widthCm: 50, heightCm: 70 },
  { code: "XL_60X80", widthCm: 60, heightCm: 80 },
  { code: "XXL_70X100", widthCm: 70, heightCm: 100 },
] as const;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundDimension(value: number) {
  return Math.max(1, Math.round(value));
}

function roundPriceEur(value: number, stepEur: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = Math.max(1, stepEur);
  return Math.round(value / step) * step;
}

export function priceFor(heightCm: number, widthCm: number, k: number, a: number, end: number) {
  if (!isPositiveNumber(heightCm) || !isPositiveNumber(widthCm)) return 0;
  const rawPriceEur = heightCm * widthCm * k + a;
  return Math.max(0, roundPriceEur(rawPriceEur, end) * 100);
}

export function generateAspectRatioPrintSizes(params: {
  originalWidthCm?: number | null;
  originalHeightCm?: number | null;
}) {
  const { originalWidthCm, originalHeightCm } = params;
  if (!isPositiveNumber(originalWidthCm) || !isPositiveNumber(originalHeightCm)) return [] as ArtistPrintSize[];

  const landscape = originalWidthCm >= originalHeightCm;
  const ratio = landscape ? originalHeightCm / originalWidthCm : originalWidthCm / originalHeightCm;

  return PRINT_LONG_EDGES.map((longEdgeCm) => {
    const longEdge = Number(longEdgeCm);
    const shortEdge = roundDimension(longEdge * ratio);
    const widthCm = landscape ? longEdge : shortEdge;
    const heightCm = landscape ? shortEdge : longEdge;
    return {
      code: `PRINT_${widthCm}X${heightCm}`,
      label: `${widthCm} x ${heightCm} cm`,
      widthCm,
      heightCm,
      longEdgeCm: longEdge,
    };
  }).filter((size, index, list) => list.findIndex((item) => item.code === size.code) === index);
}

export function getAspectRatioPrintSizeByCode(
  code: string,
  params: { originalWidthCm?: number | null; originalHeightCm?: number | null },
) {
  const normalized = code.trim().toUpperCase();
  return generateAspectRatioPrintSizes(params).find((item) => item.code === normalized);
}

export function normalizePrintSizeCode(
  code: string,
  params: { originalWidthCm?: number | null; originalHeightCm?: number | null },
) {
  const normalized = code.trim().toUpperCase();
  const generated = generateAspectRatioPrintSizes(params);
  const exact = generated.find((item) => item.code === normalized);
  if (exact) return exact.code;

  const legacy = LEGACY_STATIC_PRINT_SIZES.find((item) => item.code === normalized);
  if (!legacy) return null;

  return generated.find((item) => item.widthCm === legacy.widthCm && item.heightCm === legacy.heightCm)?.code || null;
}

export function calculatePrintFinishPriceCents(input: {
  widthCm: number;
  heightCm: number;
  finishCode: ArtistPrintFinishCode;
}) {
  const finish = PRINT_FINISHES.find((item) => item.code === input.finishCode);
  if (!finish) return 0;
  return priceFor(input.heightCm, input.widthCm, finish.k, finish.a, finish.end);
}

export function buildPrintPricePreview(params: {
  originalWidthCm?: number | null;
  originalHeightCm?: number | null;
}) {
  const sizes = generateAspectRatioPrintSizes(params);
  return sizes.map((size) => ({
    ...size,
    finishes: PRINT_FINISHES.map((finish) => ({
      code: finish.code,
      label: finish.label,
      priceCents: calculatePrintFinishPriceCents({
        widthCm: size.widthCm,
        heightCm: size.heightCm,
        finishCode: finish.code,
      }),
    })),
  }));
}
