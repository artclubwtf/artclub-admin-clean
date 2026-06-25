export const ARTIST_PAYOUT_VAT_DIVISOR = 1.19;
export const ORIGINAL_PAYOUT_RATE = 0.7;
export const PRINT_PAYOUT_RATE = 0.4;

export type ArtistPayoutType = "original" | "print" | "unknown";

type SaleTypeHint = {
  title?: string | null;
  productTitle?: string | null;
  variantTitle?: string | null;
  finish?: string | null;
  type?: string | null;
  tags?: string[] | null;
  offerings?: string | null;
  allowPrints?: boolean | null;
  originalAvailable?: boolean | null;
};

type ArtistPayoutComputation = {
  payoutType: ArtistPayoutType;
  grossSalePrice: number;
  netSalePrice: number;
  payoutRate: number;
  artistPayout: number;
};

export function computeRemainingGross(grossSalePrice: number, refundedAmount: number) {
  return toMoney(Math.max(Number(grossSalePrice || 0) - Number(refundedAmount || 0), 0));
}

export function computeRemainingQuantity(quantity: number, refundedQuantity: number) {
  return Math.max(Number(quantity || 0) - Number(refundedQuantity || 0), 0);
}

export function computeArtistPayoutTotalFromSplit(split: { print: number; original: number; unknown: number }) {
  return toMoney(
    computeArtistPayout(split.print, "print").artistPayout +
      computeArtistPayout(split.original, "original").artistPayout +
      computeArtistPayout(split.unknown, "unknown").artistPayout,
  );
}

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ORIGINAL_KEYWORDS = ["original", "unikat", "one of a kind", "one-of-a-kind", "1/1", "one of one", "one-of-one"];
const PRINT_KEYWORDS = [
  "print",
  "edition",
  "floater",
  "mounted",
  "acrylic",
  "giclee",
  "giclee print",
  "giclee edition",
  "framed",
  "poster",
  "canvas",
  "canvas print",
  "fine art print",
  "dibond",
  "aluminium",
  "aluminum",
];

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function classifyArtistPayoutType(input: SaleTypeHint): ArtistPayoutType {
  const texts = [
    input.variantTitle,
    input.finish,
    input.type,
    input.title,
    input.productTitle,
    ...(Array.isArray(input.tags) ? input.tags : []),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (texts.some((text) => containsAny(text, ORIGINAL_KEYWORDS))) return "original";
  if (texts.some((text) => containsAny(text, PRINT_KEYWORDS))) return "print";

  if (input.offerings === "original_only") return "original";
  if (input.offerings === "prints_only") return "print";
  if (input.originalAvailable && !input.allowPrints) return "original";
  if (input.allowPrints && !input.originalAvailable) return "print";

  return "unknown";
}

export function computeArtistPayout(grossSalePrice: number, payoutType: ArtistPayoutType): ArtistPayoutComputation {
  const normalizedGross = Number.isFinite(grossSalePrice) ? Math.max(grossSalePrice, 0) : 0;
  const netSalePrice = toMoney(normalizedGross / ARTIST_PAYOUT_VAT_DIVISOR);
  const payoutRate =
    payoutType === "original" ? ORIGINAL_PAYOUT_RATE : payoutType === "print" ? PRINT_PAYOUT_RATE : 0;
  const artistPayout = toMoney(netSalePrice * payoutRate);

  return {
    payoutType,
    grossSalePrice: toMoney(normalizedGross),
    netSalePrice,
    payoutRate,
    artistPayout,
  };
}
