import {
  calculatePrintFinishPriceCents,
  getAspectRatioPrintSizeByCode,
  normalizePrintSizeCode,
  PRINT_FINISHES,
} from "@/lib/print-pricing";

function formatSkuPiece(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function buildArtworkSku(artistKey: string, productKey: string, suffix: string) {
  const artistPart = formatSkuPiece(artistKey).slice(-6) || "ARTIST";
  const productPart = formatSkuPiece(productKey).slice(-6) || "PRD";
  const suffixPart = formatSkuPiece(suffix).slice(0, 18) || "ITEM";
  return `${artistPart}-${productPart}-${suffixPart}`;
}

export function dedupeTrimmed(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeSelectedPrintSizeCodes(
  values: string[],
  params: { originalWidthCm?: number | null; originalHeightCm?: number | null },
) {
  return dedupeTrimmed(values)
    .map((code) => normalizePrintSizeCode(code, params))
    .filter((code): code is string => Boolean(code));
}

export function buildPrintVariants(params: {
  shopDomain: string;
  artistKey: string;
  productKey: string;
  selectedSizeCodes: string[];
  originalWidthCm: number;
  originalHeightCm: number;
}) {
  const variants: Array<{
    shopDomain: string;
    productKey: string;
    variantKey: string;
    finish: string;
    sizeCode: string;
    sku: string;
    priceCents: number;
    inventory: { tracked: boolean };
  }> = [];

  for (const sizeCode of params.selectedSizeCodes) {
    const size = getAspectRatioPrintSizeByCode(sizeCode, params);
    if (!size) continue;
    for (const finish of PRINT_FINISHES) {
      variants.push({
        shopDomain: params.shopDomain,
        productKey: params.productKey,
        variantKey: `print_${size.code.toLowerCase()}_${finish.code}`,
        finish: finish.code,
        sizeCode: size.code,
        sku: buildArtworkSku(params.artistKey, params.productKey, `${size.code}_${finish.code}`),
        priceCents: calculatePrintFinishPriceCents({
          widthCm: size.widthCm,
          heightCm: size.heightCm,
          finishCode: finish.code,
        }),
        inventory: { tracked: false },
      });
    }
  }

  return variants;
}
