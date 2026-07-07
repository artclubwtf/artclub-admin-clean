import type { ArtistMediaItem } from "@/lib/types";

import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

type OverviewPanelsProps = {
  overview: {
    artworkCount: number;
    seriesCount: number;
    profileCompleteness: number;
    recentMedia: ArtistMediaItem[];
  };
};

export function OverviewPanels({ overview }: OverviewPanelsProps) {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Home"
        subtitle="Your profile and artwork activity."
        action={<Button href="/artworks/new">New artwork</Button>}
      />

      <Section title="Overview" subtitle="Only real, queryable metrics are shown here.">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Artworks" value={String(overview.artworkCount)} />
          <MetricCard label="Series" value={String(overview.seriesCount)} />
          <MetricCard label="Profile completeness" value={`${overview.profileCompleteness}%`} />
        </div>
      </Section>

      <Section title="Recent uploads" subtitle="Latest entries from ArtistMediaV2.">
        {overview.recentMedia.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {overview.recentMedia.map((item) => (
              <div key={item.id} className="space-y-3 rounded-[1.75rem] bg-neutral-50 p-3">
                <div className="aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.filename || item.kind} className="h-full w-full object-cover" />
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">{item.kind}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No uploads yet.</div>
        )}
      </Section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-5">
      <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">{value}</div>
    </div>
  );
}
