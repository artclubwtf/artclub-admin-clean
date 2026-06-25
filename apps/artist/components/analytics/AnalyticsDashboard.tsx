import Link from "next/link";

import type { ArtistAnalyticsResponse, ArtistAnalyticsSeriesPoint, ArtistAnalyticsTopArtwork, ArtistAnalyticsRange } from "@artclub/models";

import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import { cn } from "@/lib/cn";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

function RangeFilter({ range }: { range: ArtistAnalyticsRange }) {
  const options: ArtistAnalyticsRange[] = ["7d", "30d", "90d"];

  return (
    <div className="inline-flex rounded-full bg-neutral-100 p-1">
      {options.map((option) => {
        const active = option === range;
        return (
          <Link
            key={option}
            href={`/analytics?range=${option}`}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium tracking-[-0.01em] transition-colors",
              active ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500",
            )}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}

function TrendChart(props: { title: string; subtitle: string; data: ArtistAnalyticsSeriesPoint[] }) {
  const values = props.data.map((item) => item.count);
  const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
  const points = props.data.map((item, index) => {
    const x = props.data.length > 1 ? (index / (props.data.length - 1)) * 100 : 50;
    const y = maxValue > 0 ? 100 - (item.count / maxValue) * 80 : 100;
    return `${x},${y}`;
  });
  const polyline = points.join(" ");
  const area = `0,100 ${polyline} 100,100`;

  return (
    <div className="rounded-[1.75rem] bg-neutral-50 p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-neutral-950">{props.title}</h3>
        <p className="text-sm text-neutral-500">{props.subtitle}</p>
      </div>
      <div className="mt-6 rounded-[1.25rem] bg-white p-4">
        <svg viewBox="0 0 100 100" className="h-36 w-full" preserveAspectRatio="none" aria-hidden>
          <path d={`M ${area}`} fill="rgba(23,23,23,0.08)" />
          <polyline fill="none" stroke="rgb(23,23,23)" strokeWidth="2.2" points={polyline} />
        </svg>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          <span>{props.data[0]?.label || ""}</span>
          <span>{props.data[props.data.length - 1]?.label || ""}</span>
        </div>
      </div>
    </div>
  );
}

function TopArtworkRow({ item }: { item: ArtistAnalyticsTopArtwork }) {
  return (
    <Link
      href={`/artworks/${encodeURIComponent(item.productKey)}`}
      className="flex items-center justify-between gap-4 rounded-[1.75rem] bg-neutral-50 px-5 py-4"
    >
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-[-0.02em] text-neutral-950">{item.title}</p>
        <p className="mt-1 text-sm text-neutral-500">
          {item.views.toLocaleString("en-GB")} views · {item.clicks.toLocaleString("en-GB")} clicks
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-neutral-950">{formatPercent(item.clickThroughRate)}</p>
        <p className="mt-1 text-xs text-neutral-400">{item.uniqueVisitors.toLocaleString("en-GB")} visitors</p>
      </div>
    </Link>
  );
}

function GeoList(props: { title: string; subtitle: string; items: Array<{ label: string; count: number; uniqueVisitors: number }> }) {
  return (
    <div className="rounded-[1.75rem] bg-neutral-50 p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-neutral-950">{props.title}</h3>
        <p className="text-sm text-neutral-500">{props.subtitle}</p>
      </div>
      <div className="mt-6 space-y-3">
        {props.items.length ? (
          props.items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-[1.25rem] bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-950">{item.label}</p>
                <p className="mt-1 text-xs text-neutral-400">{item.uniqueVisitors.toLocaleString("en-GB")} unique visitors</p>
              </div>
              <p className="shrink-0 text-sm font-medium text-neutral-950">{item.count.toLocaleString("en-GB")}</p>
            </div>
          ))
        ) : (
          <div className="rounded-[1.25rem] bg-white px-4 py-4 text-sm text-neutral-500">No data yet.</div>
        )}
      </div>
    </div>
  );
}

export function AnalyticsDashboard({ analytics }: { analytics: ArtistAnalyticsResponse }) {
  const hasAnalytics =
    analytics.profileViews > 0 ||
    analytics.profileImpressions > 0 ||
    analytics.artworkViews > 0 ||
    analytics.artworkImpressions > 0 ||
    analytics.artworkClicks > 0 ||
    analytics.shopifyProductClicks > 0 ||
    analytics.uniqueVisitors > 0;

  return (
    <div className="space-y-8">
      <PageTitle
        title="Analytics"
        subtitle="Track how visitors discover your profile and artworks on the Shopify storefront, then compare that traffic with sold works."
        action={<RangeFilter range={analytics.range} />}
      />

      {!hasAnalytics ? (
        <div className="rounded-[2rem] bg-neutral-50 px-6 py-8 text-center">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-neutral-950">No analytics yet</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-500">
            Once visitors view your profile or artworks on ARTCLUB, your analytics will appear here.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Profile Views" value={analytics.profileViews.toLocaleString("en-GB")} />
        <StatCard label="Artwork Views" value={analytics.artworkViews.toLocaleString("en-GB")} />
        <StatCard label="Unique Visitors" value={analytics.uniqueVisitors.toLocaleString("en-GB")} />
        <StatCard label="Engagement Rate" value={formatPercent(analytics.engagementRate)} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Profile Impressions" value={analytics.profileImpressions.toLocaleString("en-GB")} />
        <StatCard label="Artwork Impressions" value={analytics.artworkImpressions.toLocaleString("en-GB")} />
        <StatCard label="Artwork Clicks" value={(analytics.artworkClicks + analytics.shopifyProductClicks).toLocaleString("en-GB")} />
        <StatCard label="Conversion Rate" value={formatPercent(analytics.conversionRate)} detail={`${analytics.soldItemsCount.toLocaleString("en-GB")} sold artworks`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <TrendChart title="Views over time" subtitle="Profile and artwork page views." data={analytics.viewsByDay} />
        <TrendChart title="Impressions over time" subtitle="Visible artist and artwork modules." data={analytics.impressionsByDay} />
        <TrendChart title="Clicks over time" subtitle="Artwork card and product link clicks." data={analytics.clicksByDay} />
      </section>

      <Section title="Top artworks" subtitle="Best-performing artworks for the selected time range.">
        <div className="space-y-3">
          {analytics.topArtworks.length ? (
            analytics.topArtworks.map((item) => <TopArtworkRow key={item.canonicalProductId || item.productKey} item={item} />)
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No artwork analytics yet.</div>
          )}
        </div>
      </Section>

      <section className="grid gap-4 xl:grid-cols-2">
        <GeoList title="Top cities" subtitle="Most active cities based on tracked storefront activity." items={analytics.topCities} />
        <GeoList title="Top countries" subtitle="Most active countries based on tracked storefront activity." items={analytics.topCountries} />
      </section>

      <Section title="Sales hint" subtitle="Use this alongside payouts to judge whether traffic is translating into sold works.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Sold Artworks" value={analytics.soldItemsCount.toLocaleString("en-GB")} />
          <StatCard label="Click-to-View Rate" value={formatPercent(analytics.engagementRate)} />
          <StatCard label="Click-to-Impression Rate" value={formatPercent(analytics.impressionEngagementRate)} />
        </div>
      </Section>
    </div>
  );
}
