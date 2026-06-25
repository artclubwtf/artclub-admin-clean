import Link from "next/link";

import type { ArtistEarningsResponse, ArtistRecentSale } from "@artclub/models";

import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: ArtistRecentSale["payoutStatus"] | ArtistRecentSale["orderStatus"]) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "refunded" || status === "cancelled") return "bg-rose-100 text-rose-700";
  if (status === "eligible") return "bg-sky-100 text-sky-700";
  return "bg-amber-100 text-amber-700";
}

function StatCard(props: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[1.75rem] bg-neutral-50 p-5">
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-neutral-400">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-neutral-950">{props.value}</p>
      {props.detail ? <p className="mt-2 text-sm text-neutral-500">{props.detail}</p> : null}
    </div>
  );
}

function SimpleBarChart(props: {
  title: string;
  subtitle: string;
  data: { label: string; amount: number; detail?: string }[];
  currency?: string;
}) {
  const maxValue = props.data.reduce((max, item) => Math.max(max, item.amount), 0);

  return (
    <div className="rounded-[1.75rem] bg-neutral-50 p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-neutral-950">{props.title}</h3>
        <p className="text-sm text-neutral-500">{props.subtitle}</p>
      </div>

      {props.data.length ? (
        <div className="mt-6 space-y-3">
          {props.data.map((item) => {
            const width = maxValue > 0 ? Math.max((item.amount / maxValue) * 100, 6) : 0;
            return (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-neutral-500">{item.label}</span>
                  <span className="font-medium text-neutral-950">
                    {props.currency ? formatCurrency(item.amount, props.currency) : item.amount.toLocaleString("en-GB")}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-neutral-950" style={{ width: `${width}%` }} />
                </div>
                {item.detail ? <p className="text-xs text-neutral-400">{item.detail}</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[1.25rem] bg-white px-4 py-4 text-sm text-neutral-500">No sales data yet.</div>
      )}
    </div>
  );
}

export function EarningsDashboard({ earnings }: { earnings: ArtistEarningsResponse }) {
  const hasSales = earnings.recentSales.length > 0;

  return (
    <div className="space-y-8">
      <PageTitle
        title="Earnings"
        subtitle="Track sold artworks, estimated earnings, payouts, and recent sales based on your Shopify-linked catalogue."
      />

      {!hasSales ? (
        <div className="rounded-[2rem] bg-neutral-50 px-6 py-8 text-center">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-neutral-950">No sales yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-500">
            Once your artworks are sold through ARTCLUB, your sales and earnings will appear here.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Sales" value={formatCurrency(earnings.totalSalesAmount, earnings.currency)} />
        <StatCard label="Sold Artworks" value={earnings.soldItemsCount.toLocaleString("en-GB")} />
        <StatCard
          label="Your Earnings"
          value={formatCurrency(earnings.estimatedArtistEarnings, earnings.currency)}
          detail="Estimated based on current commission data."
        />
        <StatCard label="Pending Payout" value={formatCurrency(earnings.pendingPayoutAmount, earnings.currency)} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Paid Out" value={formatCurrency(earnings.paidOutAmount, earnings.currency)} />
        <StatCard label="Refunded" value={formatCurrency(earnings.refundedAmount, earnings.currency)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SimpleBarChart
          title="Sales over time"
          subtitle="Gross sales volume by month."
          data={earnings.salesByMonth.map((item) => ({
            label: item.label,
            amount: item.totalSalesAmount,
            detail: `${item.soldItemsCount} sold`,
          }))}
          currency={earnings.currency}
        />
        <SimpleBarChart
          title="Earnings by month"
          subtitle="Estimated artist earnings by month."
          data={earnings.earningsByMonth.map((item) => ({
            label: item.label,
            amount: item.amount,
          }))}
          currency={earnings.currency}
        />
      </section>

      <Section
        title="Best-selling artworks"
        subtitle="Your strongest performers based on sold quantity and gross sales."
      >
        <div className="space-y-3">
          {earnings.bestSellingArtworks.length ? (
            earnings.bestSellingArtworks.map((item) => (
              <Link
                key={item.productKey}
                href={`/artworks/${encodeURIComponent(item.productKey)}`}
                className="flex items-center justify-between gap-4 rounded-[1.75rem] bg-neutral-50 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold tracking-[-0.02em] text-neutral-950">{item.artworkTitle}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {item.soldItemsCount} sold · {formatCurrency(item.totalSalesAmount, earnings.currency)} gross
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-neutral-950">
                  {formatCurrency(item.estimatedArtistEarnings, earnings.currency)}
                </p>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No best-seller data yet.</div>
          )}
        </div>
      </Section>

      <Section title="Recent sales" subtitle="Latest sold items with payout and order status.">
        <div className="space-y-3">
          {earnings.recentSales.length ? (
            earnings.recentSales.map((sale, index) => (
              <div key={`${sale.orderDate}:${sale.productKey || sale.artworkTitle}:${index}`} className="rounded-[1.75rem] bg-neutral-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold tracking-[-0.02em] text-neutral-950">{sale.artworkTitle}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {sale.variantTitle || "Standard variant"} · {formatDate(sale.orderDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tracking-[-0.02em] text-neutral-950">
                      {formatCurrency(sale.salePrice, earnings.currency)}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">Qty {sale.quantity}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(sale.payoutStatus)}`}>
                    {sale.payoutStatus}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(sale.orderStatus)}`}>
                    {sale.orderStatus}
                  </span>
                  {sale.artistShareIsEstimated ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-500">Estimated share</span>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end justify-between gap-3 border-t border-neutral-200 pt-4 text-sm">
                  <span className="text-neutral-500">Artist share</span>
                  <span className="font-medium text-neutral-950">{formatCurrency(sale.artistShare, earnings.currency)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No recent sales yet.</div>
          )}
        </div>
      </Section>
    </div>
  );
}
