export type ShopifyOrderStatusLike = {
  financialStatus?: string | null;
  cancelledAt?: Date | string | null;
  refundedTotalGross?: number | null;
  totalGross?: number | null;
};

export function normalizeShopifyFinancialStatus(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function isPaidShopifyFinancialStatus(status: string) {
  return status.includes("paid");
}

export function isCancelledShopifyOrder(order: ShopifyOrderStatusLike) {
  const status = normalizeShopifyFinancialStatus(order.financialStatus);
  return Boolean(order.cancelledAt) || status.includes("cancelled") || status.includes("voided");
}

export function isFullyRefundedShopifyOrder(order: ShopifyOrderStatusLike) {
  const status = normalizeShopifyFinancialStatus(order.financialStatus);
  const refundedGross = Number(order.refundedTotalGross || 0);
  const totalGross = Number(order.totalGross || 0);
  if (refundedGross > 0 && totalGross > 0 && refundedGross + 0.01 >= totalGross) return true;
  return status.includes("refund") && refundedGross > 0 && (totalGross === 0 || refundedGross + 0.01 >= totalGross);
}

export function isCountableShopifyOrder(order: ShopifyOrderStatusLike) {
  if (isCancelledShopifyOrder(order)) return false;
  if (isFullyRefundedShopifyOrder(order)) return false;
  return isPaidShopifyFinancialStatus(normalizeShopifyFinancialStatus(order.financialStatus));
}

export function normalizeShopifyOrderStatus(order: ShopifyOrderStatusLike) {
  if (isCancelledShopifyOrder(order)) return "cancelled" as const;
  if (isFullyRefundedShopifyOrder(order)) return "refunded" as const;
  if (isPaidShopifyFinancialStatus(normalizeShopifyFinancialStatus(order.financialStatus))) return "paid" as const;
  return "pending" as const;
}
