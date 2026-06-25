export type ShopifyOrderStatusLike = {
  financialStatus?: string | null;
  cancelledAt?: Date | string | null;
  refundedAmount?: number | null;
  refundedTotalGross?: number | null;
  totalGross?: number | null;
};

export function normalizeShopifyFinancialStatus(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function isPaidShopifyFinancialStatus(status: string) {
  return status === "paid" || status === "partially_paid";
}

export function isPartiallyRefundedShopifyOrder(order: ShopifyOrderStatusLike) {
  const status = normalizeShopifyFinancialStatus(order.financialStatus);
  const refundedGross = Number(order.refundedAmount ?? order.refundedTotalGross ?? 0);
  const remainingGross = Number(order.totalGross || 0);
  if (status === "partially_refunded") return remainingGross > 0;
  return refundedGross > 0 && remainingGross > 0 && !isCancelledShopifyOrder(order);
}

export function isCancelledShopifyOrder(order: ShopifyOrderStatusLike) {
  const status = normalizeShopifyFinancialStatus(order.financialStatus);
  return Boolean(order.cancelledAt) || status.includes("cancelled") || status.includes("voided");
}

export function isFullyRefundedShopifyOrder(order: ShopifyOrderStatusLike) {
  const status = normalizeShopifyFinancialStatus(order.financialStatus);
  const refundedGross = Number(order.refundedAmount ?? order.refundedTotalGross ?? 0);
  const remainingGross = Number(order.totalGross || 0);
  if (status === "refunded") return true;
  if (refundedGross > 0 && remainingGross <= 0.01) return true;
  return false;
}

export function isCountableShopifyOrder(order: ShopifyOrderStatusLike) {
  if (isCancelledShopifyOrder(order)) return false;
  if (isFullyRefundedShopifyOrder(order)) return false;
  const normalized = normalizeShopifyFinancialStatus(order.financialStatus);
  return isPaidShopifyFinancialStatus(normalized) || isPartiallyRefundedShopifyOrder(order);
}

export function normalizeShopifyOrderStatus(order: ShopifyOrderStatusLike) {
  if (isCancelledShopifyOrder(order)) return "cancelled" as const;
  if (isFullyRefundedShopifyOrder(order)) return "refunded" as const;
  if (isPaidShopifyFinancialStatus(normalizeShopifyFinancialStatus(order.financialStatus))) return "paid" as const;
  return "pending" as const;
}
