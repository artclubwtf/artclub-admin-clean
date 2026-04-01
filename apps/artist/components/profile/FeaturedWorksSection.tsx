import { Section } from "@/components/primitives/Section";
import type { ArtistFeaturedWorkItem } from "@/lib/types";

type FeaturedWorksSectionProps = {
  items: ArtistFeaturedWorkItem[];
};

export function FeaturedWorksSection({ items }: FeaturedWorksSectionProps) {
  if (!items.length) return null;

  return (
    <Section title="Featured works" subtitle="Latest canonical artworks for quick profile context.">
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.productKey} className="flex gap-4 rounded-[2rem] bg-neutral-50 px-4 py-4">
            {item.imageUrl ? (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[1.25rem] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="space-y-1">
              <div className="text-sm font-semibold tracking-[-0.01em] text-neutral-950">{item.title}</div>
              <div className="text-sm text-neutral-500">{[item.seriesName, item.status].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
