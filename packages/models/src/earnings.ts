import { z } from "zod";

export const artistEarningsPayoutStatuses = z.enum(["pending", "eligible", "paid", "refunded", "cancelled"]);
export type ArtistEarningsPayoutStatus = z.infer<typeof artistEarningsPayoutStatuses>;

export const artistEarningsOrderStatuses = z.enum(["pending", "paid", "refunded", "cancelled"]);
export type ArtistEarningsOrderStatus = z.infer<typeof artistEarningsOrderStatuses>;

export const artistEarningsMonthlySalesPoint = z.object({
  month: z.string(),
  label: z.string(),
  soldItemsCount: z.number(),
  totalSalesAmount: z.number(),
});
export type ArtistEarningsMonthlySalesPoint = z.infer<typeof artistEarningsMonthlySalesPoint>;

export const artistEarningsMonthlyAmountPoint = z.object({
  month: z.string(),
  label: z.string(),
  amount: z.number(),
});
export type ArtistEarningsMonthlyAmountPoint = z.infer<typeof artistEarningsMonthlyAmountPoint>;

export const artistBestSellingArtwork = z.object({
  productKey: z.string(),
  artworkTitle: z.string(),
  soldItemsCount: z.number(),
  totalSalesAmount: z.number(),
  estimatedArtistEarnings: z.number(),
});
export type ArtistBestSellingArtwork = z.infer<typeof artistBestSellingArtwork>;

export const artistRecentSale = z.object({
  orderDate: z.string(),
  artworkTitle: z.string(),
  variantTitle: z.string().nullable().optional(),
  quantity: z.number(),
  salePrice: z.number(),
  artistShare: z.number(),
  artistShareIsEstimated: z.boolean().optional(),
  payoutStatus: artistEarningsPayoutStatuses,
  orderStatus: artistEarningsOrderStatuses,
  productKey: z.string().optional(),
});
export type ArtistRecentSale = z.infer<typeof artistRecentSale>;

export const artistEarningsResponse = z.object({
  currency: z.string().default("EUR"),
  totalSalesAmount: z.number(),
  soldItemsCount: z.number(),
  estimatedArtistEarnings: z.number(),
  pendingPayoutAmount: z.number(),
  paidOutAmount: z.number(),
  refundedAmount: z.number(),
  salesByMonth: z.array(artistEarningsMonthlySalesPoint),
  earningsByMonth: z.array(artistEarningsMonthlyAmountPoint),
  bestSellingArtworks: z.array(artistBestSellingArtwork),
  recentSales: z.array(artistRecentSale),
});
export type ArtistEarningsResponse = z.infer<typeof artistEarningsResponse>;
